FROM rust:1.84 AS builder

WORKDIR /usr/src/app

# Copy the Cargo files first (optimizes caching)
COPY Cargo.toml Cargo.lock ./

# Create a dummy main.rs to cache dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs

# Install build dependencies
RUN apt-get update && apt-get install -y \
    protobuf-compiler \
    && rm -rf /var/lib/apt/lists/*

RUN cargo build --release

# Copy the actual source code
COPY src ./src

# Build the real application
RUN cargo build --release

# Stage 2: Create the runtime image
FROM debian:bookworm-slim

# Set working directory
WORKDIR /app

# Copy the binary from the builder stage
COPY --from=builder /usr/src/app/target/release/vixen-server /app/

# Expose the port your gRPC server uses
EXPOSE ${PORT}

# Run the application with config file argument
CMD ["/app/vixen-server", "--config", "${CONFIG_FILE}"]
