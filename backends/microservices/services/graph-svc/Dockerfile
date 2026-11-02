FROM golang:1.27.3-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build \
  -trimpath \
  -ldflags="-s -w" \
  -o /graph-svc ./cmd/graph-svc

FROM alpine:3.22

WORKDIR /app

RUN apk add --no-cache ca-certificates \
  && addgroup -S app \
  && adduser -S -G app app

COPY --from=builder /graph-svc ./graph-svc

USER app
EXPOSE 4002

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4002/livez || exit 1

ENTRYPOINT ["./graph-svc"]
