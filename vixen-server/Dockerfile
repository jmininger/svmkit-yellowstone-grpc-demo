FROM rust:1.84 AS builder

WORKDIR /usr/src/app

# Copy the Cargo files first (optimizes caching)
COPY Cargo.toml Cargo.lock ./

# Create a dummy main.rs to cache dependencies
RUN mkdir src

# Install build dependencies
RUN apt-get update && apt-get install -y \
    protobuf-compiler \
    && rm -rf /var/lib/apt/lists/*

# Copy the actual source code
COPY src ./src

# Build the real application
RUN cargo build --release

# Stage 2: Create the runtime image
FROM debian:bookworm-slim

# Install CA certificates
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy the binary from the builder stage
COPY --from=builder /usr/src/app/target/release/vixen-server /app/

# Expose the port your gRPC server uses
# EXPOSE ${PORT}

# Run the application with config file argument
CMD /app/vixen-server --config $CONFIG_FILE
