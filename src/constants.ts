export const BOARD_SIZE = 9;
export const LAST_CELL = BOARD_SIZE - 1;
export const WALL_GRID_SIZE = BOARD_SIZE - 1;
export const INITIAL_WALLS = 10;
export const TURN_SECONDS = 30;
export const FISHER_SECONDS = 30;
export const FISHER_INCREMENT = 5;

export const isCellCoord = (value: number): boolean =>
  Number.isInteger(value) && value >= 0 && value < BOARD_SIZE;

export const isWallCoord = (value: number): boolean =>
  Number.isInteger(value) && value >= 0 && value < WALL_GRID_SIZE;
