export const Dir = { None: 0, Up: 1, Down: 2, Left: 3, Right: 4 } as const;

export type Dir = typeof Dir[keyof typeof Dir];
