import * as http from "http";
import * as util from "util";
import { exec as execRaw } from "child_process";
import { ConfigKey, getConfig } from "./config";
import { formatMeasurement, log } from "./utils";

const exec = util.promisify(execRaw);

// get config
const targetList = getConfig(ConfigKey.TargetList);
const options = getConfig(ConfigKey.Options);
const protocol = getConfig(ConfigKey.Protocol, "tcp");
const targets = targetList.split(",").map((t) => t.trim());
const testIntervalMs = parseInt(getConfig(ConfigKey.TestIntervalMs, "600000"));

async function getMeasurements(): Promise<string[]> {
  const measurements: string[] = [];

  for (const target of targets) {
    const tags = {
      target,
      options,
    };

    try {
      let udpOptionStr = "";
      if (protocol == "udp") {
        udpOptionStr = "--udp";
      }

      test_starts_total++;
      const iperfCmd = await exec(`iperf3 -c ${target} ${udpOptionStr} --json ${options}`);
      test_ends_total++;
      const result = JSON.parse(iperfCmd.stdout);
      if (result["error"]) {
        throw result["error"];
      }
      measurements.push(formatMeasurement("iperf_starts_total", tags, test_starts_total));
      measurements.push(formatMeasurement("iperf_ends_total", tags, test_ends_total));

      switch(protocol) {
        case "tcp":
          measurements.push(formatMeasurement("iperf_sent_bytes", tags, parseFloat(result["end"]["sum_sent"]["bytes"])));
          measurements.push(
              formatMeasurement("iperf_sent_seconds", tags, parseFloat(result["end"]["sum_sent"]["seconds"])),
          );
          measurements.push(
              formatMeasurement("iperf_received_bytes", tags, parseFloat(result["end"]["sum_received"]["bytes"])),
          );
          measurements.push(
              formatMeasurement("iperf_received_seconds", tags, parseFloat(result["end"]["sum_received"]["seconds"])),
          );
          break;
        case "udp":
          measurements.push(
              formatMeasurement("iperf_lost_packets", tags, parseFloat(result["end"]["sum"]["lost_packets"])),
          );
          measurements.push(
              formatMeasurement("iperf_received_bytes", tags, parseFloat(result["end"]["sum"]["bytes"])),
          );
          measurements.push(
              formatMeasurement("iperf_received_seconds", tags, parseFloat(result["end"]["sum"]["seconds"])),
          );
          break;
        default:
          throw `unsupported protocol ${protocol}`;
      }
    } catch (e) {
      log(`Could not get iperf metrics for ${target}`, e);
      continue;
    }
  }

  return measurements;
}

// string array of metrics, or null if collection is failing
let latestMeasurements = [];
let test_starts_total =0;
let test_ends_total =0;
setInterval(async () => {
  try {
    log("Refreshing metrics...");
    latestMeasurements = await getMeasurements();
  } catch (err) {
    log("Failed to get measurements", err);
    latestMeasurements = null;
  }
}, testIntervalMs);

const server = http.createServer((req, res) => {
  if (req.url !== "/metrics") {
    res.writeHead(404).end();
    return;
  }

  if (latestMeasurements !== null) {
    res
      .writeHead(200, {
        "Content-Type": "text/plain",
      })
      .end(latestMeasurements.join("\n"));
  } else {
    res.writeHead(500).end();
  }
});

server.listen(9030, () => log("Server listening on HTTP/9030"));

process.on("SIGTERM", () => {
  log("Closing server connection");
  server.close(() => {
    log("Exiting process");
    process.exit(0);
  });
});
