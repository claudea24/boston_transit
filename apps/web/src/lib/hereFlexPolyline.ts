const DECODING_TABLE = [
  62, -1, -1, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, -1, -1, -1, -1, -1, -1, -1,
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
  22, 23, 24, 25, -1, -1, -1, -1, 63, -1, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35,
  36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51,
];

function toSigned(value: number): number {
  return value & 1 ? ~(value >> 1) : value >> 1;
}

function* decodeUnsignedChars(encoded: string): Generator<number> {
  let result = 0;
  let shift = 0;
  for (let i = 0; i < encoded.length; i++) {
    const code = encoded.charCodeAt(i) - 45;
    if (code < 0 || code >= DECODING_TABLE.length) continue;
    const value = DECODING_TABLE[code];
    if (value < 0) continue;
    result |= (value & 0x1f) << shift;
    if ((value & 0x20) === 0) {
      yield result;
      result = 0;
      shift = 0;
    } else {
      shift += 5;
    }
  }
}

export interface HereDecodedPolyline {
  coordinates: Array<[number, number]>;
  precision: number;
  hasZ: boolean;
}

export function decodeHereFlexPolyline(encoded: string): HereDecodedPolyline {
  const iter = decodeUnsignedChars(encoded);

  const headerVersionEntry = iter.next();
  if (headerVersionEntry.done) {
    return { coordinates: [], precision: 5, hasZ: false };
  }
  if (headerVersionEntry.value !== 1) {
    throw new Error(`Unsupported HERE polyline version ${headerVersionEntry.value}`);
  }

  const headerEntry = iter.next();
  if (headerEntry.done) {
    return { coordinates: [], precision: 5, hasZ: false };
  }
  const header = headerEntry.value;
  const precision = header & 15;
  const thirdDim = (header >> 4) & 7;
  const thirdDimPrecision = (header >> 7) & 15;
  const factor = 10 ** precision;
  const factorZ = 10 ** thirdDimPrecision;

  let lat = 0;
  let lng = 0;
  let z = 0;
  const coordinates: Array<[number, number]> = [];
  while (true) {
    const latEntry = iter.next();
    if (latEntry.done) break;
    const lngEntry = iter.next();
    if (lngEntry.done) break;
    lat += toSigned(latEntry.value);
    lng += toSigned(lngEntry.value);
    if (thirdDim > 0) {
      const zEntry = iter.next();
      if (zEntry.done) break;
      z += toSigned(zEntry.value);
      // z is discarded; reference assignment so TS knows we consumed it
      void z;
      void factorZ;
    }
    coordinates.push([lng / factor, lat / factor]);
  }

  return { coordinates, precision, hasZ: thirdDim > 0 };
}
