import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { useConnect } from "./useConnect";

export function useDeepLink() {
  const { connectToAddress } = useConnect();

  useEffect(() => {
    let unlistenDeepLink: (() => void) | undefined;
    let unlistenSingleInstance: (() => void) | undefined;

    const handleUrls = (urls: string[]) => {
      for (const raw of urls) {
        const address = parseDeepLink(raw);
        if (address) {
          connectToAddress(address, "deep-link");
        }
      }
    };

    const setup = async () => {
      unlistenDeepLink = await onOpenUrl(handleUrls);
      unlistenSingleInstance = await listen<string[]>(
        "deep-link://new-url",
        (event) => handleUrls(event.payload),
      );
    };

    setup();

    return () => {
      unlistenDeepLink?.();
      unlistenSingleInstance?.();
    };
  }, [connectToAddress]);
}

function parseDeepLink(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "ss13:") return null;

    const host = url.hostname;
    const port = url.port;
    if (!host) return null;

    return port ? `${host}:${port}` : host;
  } catch {
    return null;
  }
}
