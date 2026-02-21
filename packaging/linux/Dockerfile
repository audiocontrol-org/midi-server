# Linux build environment for MIDI Server
# Ubuntu 22.04 x64 with all dependencies for building C++ and Electron packages

FROM ubuntu:22.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install build dependencies (matches .github/workflows/release-linux.yml)
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    curl \
    git \
    # ALSA for MIDI
    libasound2-dev \
    # Font rendering
    libfreetype6-dev \
    libfontconfig1-dev \
    # X11 dependencies
    libx11-dev \
    libxrandr-dev \
    libxcursor-dev \
    libxinerama-dev \
    libgl1-mesa-dev \
    # GTK and desktop integration
    libgtk-3-dev \
    libnotify-dev \
    libnss3-dev \
    libxss-dev \
    libxtst-dev \
    libsecret-1-dev \
    libgbm-dev \
    # Electron dependencies
    libdrm-dev \
    libatk1.0-dev \
    libatk-bridge2.0-dev \
    libcups2-dev \
    libxcomposite-dev \
    libxdamage-dev \
    libxfixes-dev \
    # Package building
    fakeroot \
    dpkg-dev \
    # Utilities
    rsync \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for build
RUN useradd -m -s /bin/bash builder
USER builder
WORKDIR /home/builder

# Default command shows help
CMD ["echo", "Use docker-build.sh to run builds"]
