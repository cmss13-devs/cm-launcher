import type { Relay } from "./types";

export const GAME_STATES: Record<number, string> = {
  0: "Starting",
  1: "Lobby",
  2: "Setting Up",
  3: "Playing",
  4: "Finished",
};

export const RELAYS: Relay[] = [
  { id: "direct", name: "Direct", host: "direct.cm-ss13.com" },
  { id: "nyc", name: "NYC", host: "nyc.cm-ss13.com" },
  { id: "uk", name: "UK", host: "uk.cm-ss13.com" },
  { id: "eu-e", name: "EU East", host: "eu-e.cm-ss13.com" },
  { id: "eu-w", name: "EU West", host: "eu-w.cm-ss13.com" },
  { id: "aus", name: "Australia", host: "aus.cm-ss13.com" },
  { id: "us-e", name: "US East", host: "us-e.cm-ss13.com" },
  { id: "us-w", name: "US West", host: "us-w.cm-ss13.com" },
  { id: "asia-se", name: "SE Asia", host: "asia-se.cm-ss13.com" },
];

export const PING_PORT = 4000;
export const PING_COUNT = 10;
export const PING_TIMEOUT_MS = 5000;
