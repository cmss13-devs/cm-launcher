import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { create } from "zustand";
import { RELAYS } from "../constants";
import type { RelayWithPing, Server } from "../types";
import { pingRelay } from "../utils";

interface ServerUpdateEvent {
  servers: Server[];
}

interface ServerErrorEvent {
  error: string;
}

interface ServerStore {
  servers: Server[];
  loading: boolean;
  error: string | null;
  relays: RelayWithPing[];
  selectedRelay: string;

  setSelectedRelay: (id: string) => void;
  initListener: () => Promise<UnlistenFn>;
  initRelays: () => Promise<void>;
}

export const useServerStore = create<ServerStore>()((set, get) => ({
  servers: [],
  loading: true,
  error: null,
  relays: RELAYS.map((r) => ({ ...r, ping: null, checking: true })),
  selectedRelay: "direct",

  setSelectedRelay: (selectedRelay) => set({ selectedRelay }),

  initListener: async () => {
    // Fetch initial data immediately
    try {
      const servers = await invoke<Server[]>("get_servers");
      if (servers.length > 0) {
        set({ servers, loading: false, error: null });
      }
    } catch (err) {
      console.error("Failed to get initial servers:", err);
    }

    const unlistenUpdate = await listen<ServerUpdateEvent>(
      "servers-updated",
      (event) => {
        set({ servers: event.payload.servers, loading: false, error: null });
      }
    );

    const unlistenError = await listen<ServerErrorEvent>(
      "servers-error",
      (event) => {
        set({ error: event.payload.error, loading: false });
      }
    );

    return () => {
      unlistenUpdate();
      unlistenError();
    };
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
