import consola from "consola";

// Configure consola to show debug messages
consola.level = 4; // 0: fatal, 1: error, 2: warn, 3: info, 4: debug, 5: trace
export const logger = consola.withTag("bridge");
