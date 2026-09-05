import { createSocket } from "node:dgram";

export interface SsdpDevice {
  address: string;
  port: number;
  location?: string;
  server?: string;
  usn?: string;
  st?: string;
}

const SSDP_MULTICAST = "239.255.255.250";
const SSDP_PORT = 1900;

/**
 * Descobre dispositivos UPnP/SSDP na rede local (Sonos, Roku, muitas Smart TVs, DLNA, etc).
 * Envia um M-SEARCH multicast e coleta as respostas durante `timeoutMs`.
 */
export function discoverSsdp(timeoutMs = 4000): Promise<SsdpDevice[]> {
  return new Promise((resolve) => {
    const socket = createSocket("udp4");
    const found = new Map<string, SsdpDevice>();

    const message = Buffer.from(
      [
        "M-SEARCH * HTTP/1.1",
        `HOST: ${SSDP_MULTICAST}:${SSDP_PORT}`,
        'MAN: "ssdp:discover"',
        "MX: 2",
        "ST: ssdp:all",
        "",
        "",
      ].join("\r\n")
    );

    socket.on("message", (msg, rinfo) => {
      const text = msg.toString();
      const headers: Record<string, string> = {};
      for (const line of text.split("\r\n").slice(1)) {
        const idx = line.indexOf(":");
        if (idx === -1) continue;
        headers[line.slice(0, idx).trim().toUpperCase()] = line.slice(idx + 1).trim();
      }

      const key = `${rinfo.address}:${headers["USN"] ?? ""}`;
      found.set(key, {
        address: rinfo.address,
        port: rinfo.port,
        location: headers["LOCATION"],
        server: headers["SERVER"],
        usn: headers["USN"],
        st: headers["ST"],
      });
    });

    socket.bind(() => {
      socket.send(message, SSDP_PORT, SSDP_MULTICAST);
    });

    setTimeout(() => {
      socket.close();
      resolve([...found.values()]);
    }, timeoutMs);
  });
}
