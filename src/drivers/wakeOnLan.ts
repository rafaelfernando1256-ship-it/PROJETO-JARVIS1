import { createSocket } from "node:dgram";

/** Envia um pacote magico Wake-on-LAN por broadcast UDP na porta 9. */
export function sendWakeOnLan(mac: string): Promise<void> {
  const bytes = mac.split(/[:-]/).map((b) => parseInt(b, 16));
  if (bytes.length !== 6 || bytes.some(Number.isNaN)) {
    return Promise.reject(new Error(`MAC address invalido: ${mac}`));
  }

  const magicPacket = Buffer.alloc(6 + 16 * 6, 0xff);
  for (let i = 0; i < 16; i++) {
    Buffer.from(bytes).copy(magicPacket, 6 + i * 6);
  }

  return new Promise((resolve, reject) => {
    const socket = createSocket("udp4");
    socket.bind(() => socket.setBroadcast(true));
    socket.send(magicPacket, 9, "255.255.255.255", (err) => {
      socket.close();
      if (err) reject(err);
      else resolve();
    });
  });
}
