import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { create } from "zustand";
import type { RelayWithPing, Server } from "../types";

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
  relaysReady: boolean;

  setSelectedRelay: (id: string) => void;
  initListener: () => Promise<UnlistenFn>;
  initRelays: () => Promise<UnlistenFn>;
}

function hasValidPing(relays: RelayWithPing[]): boolean {
  return relays.some((r) => r.ping !== null && !r.checking);
}

export const useServerStore = create<ServerStore>()((set) => ({
  servers: [],
  loading: true,
  error: null,
  relays: [],
  selectedRelay: "",
  relaysReady: false,

  setSelectedRelay: async (selectedRelay) => {
    set({ selectedRelay });
    await invoke("set_selected_relay", { id: selectedRelay });
  },

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
    // Fetch initial relay data
    try {
      const relays = await invoke<RelayWithPing[]>("get_relays");
      const ready = hasValidPing(relays);
      set({ relays, relaysReady: ready });

      const selectedRelay = await invoke<string>("get_selected_relay");
      set({ selectedRelay });
    } catch (err) {
      console.error("Failed to get initial relays:", err);
    }

    // Listen for relay updates from backend
    const unlistenRelaysUpdated = await listen<RelayWithPing[]>(
      "relays-updated",
      (event) => {
        const relays = event.payload;
        const isReady = hasValidPing(relays);
        set({ relays, relaysReady: isReady });
      }
    );

    // Backend handles auto-selection and emits this event
    const unlistenRelaySelected = await listen<string>(
      "relay-selected",
      (event) => {
        set({ selectedRelay: event.payload, relaysReady: true });
      }
    );

    return () => {
      unlistenRelaysUpdated();
      unlistenRelaySelected();
    };
  },
}));
