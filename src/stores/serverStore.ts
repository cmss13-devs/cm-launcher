import { create } from "zustand";
import { RELAYS, SERVER_API_URL, SERVER_FETCH_INTERVAL_MS } from "../constants";
import type { RelayWithPing, Server } from "../types";
import { pingRelay } from "../utils";

interface ServerStore {
  servers: Server[];
  loading: boolean;
  error: string | null;
  relays: RelayWithPing[];
  selectedRelay: string;

  setSelectedRelay: (id: string) => void;
  startFetching: () => () => void;
  initRelays: () => Promise<void>;
}

export const useServerStore = create<ServerStore>()((set, get) => ({
  servers: [],
  loading: true,
  error: null,
  relays: RELAYS.map((r) => ({ ...r, ping: null, checking: true })),
  selectedRelay: "direct",

  setSelectedRelay: (selectedRelay) => set({ selectedRelay }),

  startFetching: () => {
    const fetchServers = async () => {
      try {
        set({ loading: true });
        const response = await fetch(SERVER_API_URL);
        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }
        const data = await response.json();
        set({ servers: data.servers || [], error: null });
      } catch (err) {
        set({ error: err instanceof Error ? err.message : "Unknown error" });
      } finally {
        set({ loading: false });
      }
    };

    fetchServers();
    const interval = setInterval(fetchServers, SERVER_FETCH_INTERVAL_MS);
    return () => clearInterval(interval);
  },

  initRelays: async () => {
    const results = await Promise.all(
      RELAYS.map(async (relay) => {
        const ping = await pingRelay(relay.host);
        return { ...relay, ping, checking: false };
      })
    );

    results.sort((a, b) => {
      if (a.ping === null && b.ping === null) return 0;
      if (a.ping === null) return 1;
      if (b.ping === null) return -1;
      return a.ping - b.ping;
    });

    set({ relays: results });

    const bestRelay = results.find((r) => r.ping !== null);
    if (bestRelay) {
      get().setSelectedRelay(bestRelay.id);
    }
  },
}));
