# Official Portaldot mainnet node, pinned to an upstream commit and verified before extraction.
FROM ubuntu:22.04

ARG PORTALDOT_COMMIT=1ff0b2b3dc85925a91c6f1483567582fca0c79cd
ARG PORTALDOT_TARBALL=portaldot-mainnet-ubuntu.tar.gz
ARG PORTALDOT_SHA256=539a43dbb37da8d0f60822bc5b3dd15556cdae7c30f02b1d2eb2f83a9ba7ad0a

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL -o /tmp/node.tgz \
      "https://github.com/portaldotVolunteer/Portaldot-node/raw/${PORTALDOT_COMMIT}/${PORTALDOT_TARBALL}" \
 && echo "${PORTALDOT_SHA256}  /tmp/node.tgz" | sha256sum -c - \
 && mkdir -p /opt/portaldot \
 && tar -xzf /tmp/node.tgz -C /opt/portaldot --strip-components=1 \
 && chmod 0755 /opt/portaldot/portaldot /opt/portaldot/subkey \
 && rm /tmp/node.tgz \
 && /opt/portaldot/portaldot --version

RUN useradd --uid 10001 --create-home portaldot && mkdir /data && chown portaldot /data
USER portaldot
VOLUME /data
EXPOSE 30333

# RPC/WS/metrics stay on loopback: no --rpc-external/--ws-external, and the default
# --rpc-methods Auto keeps author_rotateKeys available to the agent sharing this namespace.
ENTRYPOINT ["/opt/portaldot/portaldot", "--chain", "/opt/portaldot/pot_mainnet_spec_raw.json", "--base-path", "/data", "--no-telemetry", "--prometheus-port", "9615"]
CMD ["--name", "portalnode"]
