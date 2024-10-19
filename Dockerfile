FROM docker.io/golang:1.23.2@sha256:cc637ce72c1db9586bd461cc5882df5a1c06232fd5dfe211d3b32f79c5a999fc as builder
WORKDIR /app

COPY go.mod Makefile ./
COPY ./cmd ./cmd
#See https://www.reddit.com/r/golang/comments/15o9trk/binsh_manager_not_found/
#See https://www.reddit.com/r/golang/comments/pi97sp/what_is_the_consequence_of_using_cgo_enabled0/
ENV CGO_ENABLE=0
RUN make build

# ---

# See https://github.com/docker-library/golang/blob/89de06f6dd2c4edb29f33bb7270bdcc8000cf58a/1.23/alpine3.20/Dockerfile#L7C1-L7C17
FROM alpine:3.20
WORKDIR /app

RUN apk add --no-cache iperf3

COPY --from=builder /app/build /app/build
RUN /app/build/main -h || echo ignore error during run container
CMD ["/app/build/main"]
