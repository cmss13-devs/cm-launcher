import { useSinglePlayer } from "../hooks";

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export const SinglePlayerPanel = () => {
  const {
    status,
    latestRelease,
    loading,
    checking,
    error,
    updateAvailable,
    refresh,
    install,
    remove,
    launch,
  } = useSinglePlayer();

  if (checking) {
    return (
      <div className="singleplayer-panel">
        <div className="singleplayer-loading">
          <div className="singleplayer-spinner" />
          <p>Checking single player status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="singleplayer-panel">
      <div className="singleplayer-header">
        <h3>Sandbox</h3>
        <p className="singleplayer-description">
          Run a local server to explore maps, test features, and experiment with admin tools. Not a playable single-player experience.
        </p>
      </div>

      {error && (
        <div className="singleplayer-error">
          <span>{error}</span>
          <button type="button" className="button-secondary" onClick={refresh}>
            Retry
          </button>
        </div>
      )}

      <div className="singleplayer-content">
        {loading ? (
          <div className="singleplayer-progress">
            <div className="singleplayer-spinner" />
            <p>This may take a while depending on your connection...</p>
          </div>
        ) : (
          <div className="singleplayer-connect-area">
            <button
              type="button"
              className="button singleplayer-connect-button"
              disabled={!status.installed || loading}
              onClick={launch}
            >
              Connect
            </button>
            {!status.installed && latestRelease?.size && (
              <p className="singleplayer-size-hint">
                Download Size: {formatBytes(latestRelease.size)}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="singleplayer-footer">
        <div className="singleplayer-status-indicator">
          {status.installed ? (
            <span className={updateAvailable ? "status-warning" : "status-ok"}>
              {updateAvailable ? "Update Required" : `Up to Date (${status.version})`}
            </span>
          ) : (
            <span>Not Installed</span>
          )}
        </div>
        <div className="singleplayer-actions">
          {status.installed ? (
            <>
              {updateAvailable && (
                <button
                  type="button"
                  className="button"
                  onClick={install}
                  disabled={loading}
                >
                  {loading ? "Updating..." : "Update"}
                </button>
              )}
              <button
                type="button"
                className="button-secondary"
                onClick={remove}
                disabled={loading}
              >
                {loading ? "Removing..." : "Remove"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="button"
              onClick={install}
              disabled={loading || !latestRelease?.download_url}
            >
              {loading ? "Downloading..." : "Download"}
            </button>
          )}
          <button
            type="button"
            className="button-secondary"
            onClick={refresh}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
};
