const { decodeImaAdpcmPacket } = require('../services/websocketStream');

describe('IMA ADPCM stream packets', () => {
  test('decodes an independently framed block to PCM s16le', () => {
    // Predictor=0, index=0, codes 7 then 0 (low nibble first).
    // IMA reconstruction yields samples [0, 11, 13].
    const packet = Buffer.alloc(14);
    packet[0] = 0x03;
    packet.writeUInt16BE(12, 1);
    packet.writeUInt32BE(1234, 3);
    packet.writeUInt16BE(3, 7);
    packet.writeInt16BE(0, 9);
    packet[11] = 0;
    packet[12] = 1;
    packet[13] = 0x07;

    const pcm = decodeImaAdpcmPacket(packet);

    expect(Array.from(new Int16Array(pcm.buffer, pcm.byteOffset, 3))).toEqual([0, 11, 13]);
  });

  test('rejects truncated blocks', () => {
    const packet = Buffer.alloc(13);
    packet[0] = 0x03;
    packet.writeUInt16BE(4, 7);
    packet[12] = 1;

    expect(() => decodeImaAdpcmPacket(packet)).toThrow('truncated');
  });
});

