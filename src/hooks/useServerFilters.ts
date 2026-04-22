import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LauncherConfig, Server } from "../bindings";
import { useSettingsStore, type StoredFilters } from "../stores/settingsStore";

export function useServerFilters(servers: Server[], config: LauncherConfig | null) {
  const storedFilters = useSettingsStore((s) => s.filters);
  const saveFilters = useSettingsStore((s) => s.saveFilters);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(storedFilters.tags);
  const [show18Plus, setShow18Plus] = useState(storedFilters.show18Plus);
  const [showOffline, setShowOffline] = useState(
    storedFilters.showOffline ?? config?.features.show_offline_servers ?? false,
  );
  const [showHubStatus, setShowHubStatus] = useState(storedFilters.showHubStatus);
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(storedFilters.regions);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      return;
    }
    const filters: StoredFilters = {
      tags: selectedTags,
      show18Plus,
      showOffline,
      showHubStatus,
      regions: selectedRegions,
    };
    saveFilters(filters);
  }, [selectedTags, show18Plus, showOffline, showHubStatus, selectedRegions, saveFilters]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filtersRef.current && !filtersRef.current.contains(event.target as Node)) {
        setFiltersOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleTag = useCallback((tag: string, on: boolean) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (on) next.add(tag);
      else next.delete(tag);
      return next;
    });
  }, []);

  const toggleRegion = useCallback((region: string, on: boolean) => {
    setSelectedRegions((prev) => {
      const next = new Set(prev);
      if (on) next.add(region);
      else next.delete(region);
      return next;
    });
  }, []);

  const categories = useMemo(() => {
    const tagSet = new Set<string>();
    for (const server of servers) {
      if (server.tags) for (const tag of server.tags) tagSet.add(tag);
    }
    tagSet.delete("18+");
    const sorted = Array.from(tagSet).sort();

    const pvpIndex = sorted.findIndex((t) => t.toLowerCase() === "pvp");
    if (pvpIndex > 0) {
      const [pvp] = sorted.splice(pvpIndex, 1);
      sorted.unshift(pvp);
    }

    if (config?.features.singleplayer) sorted.push("sandbox");
    return sorted;
  }, [servers, config?.features.singleplayer]);

  const regions = useMemo(() => {
    const regionSet = new Set<string>();
    for (const server of servers) {
      if (server.region) regionSet.add(server.region);
    }
    return Array.from(regionSet).sort();
  }, [servers]);

  const hasOffline = useMemo(
    () => servers.some((s) => s.status !== "available"),
    [servers],
  );
  const hasHubStatus = useMemo(
    () => servers.some((s) => (s.hub_status ?? "").length > 0),
    [servers],
  );

  const filteredServers = useMemo(() => {
    const seen = new Set<string>();
    const uniqueServers = servers.filter((server) => {
      if (seen.has(server.url)) return false;
      seen.add(server.url);
      return true;
    });

    let filtered =
      selectedTags.size > 0
        ? uniqueServers.filter((server) =>
            server.tags?.some((t) => selectedTags.has(t)),
          )
        : uniqueServers;

    if (selectedRegions.size > 0) {
      filtered = filtered.filter((server) =>
        server.region && selectedRegions.has(server.region),
      );
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((server) =>
        server.name.toLowerCase().includes(query),
      );
    }

    if (!show18Plus) {
      filtered = filtered.filter((server) => !server.is_18_plus);
    }

    if (!showOffline) {
      filtered = filtered.filter((server) => server.status === "available");
    }

    return filtered.sort((a, b) => {
      const aOnline = a.status === "available";
      const bOnline = b.status === "available";
      if (aOnline !== bOnline) return aOnline ? -1 : 1;
      return (b.players ?? 0) - (a.players ?? 0);
    });
  }, [
    servers,
    selectedTags,
    selectedRegions,
    searchQuery,
    show18Plus,
    showOffline,
  ]);

  return {
    searchQuery,
    setSearchQuery,
    selectedTags,
    toggleTag,
    show18Plus,
    setShow18Plus,
    showOffline,
    setShowOffline,
    showHubStatus,
    setShowHubStatus,
    selectedRegions,
    toggleRegion,
    regions,
    filtersOpen,
    setFiltersOpen,
    filtersRef,
    categories,
    hasOffline,
    hasHubStatus,
    filteredServers,
  };
}
