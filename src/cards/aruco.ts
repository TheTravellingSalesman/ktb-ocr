/**
 * Bit patterns for the ArUco 4x4 dictionary markers the card prints.
 *
 * Each pattern is the 4x4 interior, top row first, with "1" for a black
 * cell. The printed marker adds a one-cell black border, making it 6x6. A
 * unit test checks these against OpenCV's own dictionary.
 */
export const ARUCO_4X4_BITS: Record<number, string[]> = {
  0: ["0100", "1010", "1100", "1101"],
  1: ["1111", "0000", "0110", "0101"],
  2: ["1100", "1100", "1101", "0010"],
  3: ["0110", "0110", "1011", "1001"],
};

/** The full 6x6 marker grid including its black border, `true` for black */
export function markerGrid(id: number): boolean[][] {
  const bits = ARUCO_4X4_BITS[id];
  if (!bits) throw new Error(`no ArUco bit pattern for marker ${id}`);
  return Array.from({ length: 6 }, (_, y) =>
    Array.from({ length: 6 }, (_, x) => {
      if (x === 0 || y === 0 || x === 5 || y === 5) return true;
      return bits[y - 1][x - 1] === "1";
    }),
  );
}
