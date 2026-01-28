import { useAuthStore, useSettingsStore, useSteamStore } from "../stores";

interface AccountDisplayProps {
  avatar: string;
  name: string;
  status: string;
  action?: {
    label: string;
    onClick: () => void;
    primary?: boolean;
  };
}

function AccountDisplay({ avatar, name, status, action }: AccountDisplayProps) {
  return (
    <>
      <div className="account-avatar">{avatar}</div>
      <div className="account-details">
        <div className="account-name">{name}</div>
        <div className="account-status">{status}</div>
      </div>
      {action && (
        <button
          type="button"
          className={action.primary ? "button" : "button-secondary"}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </>
  );
}

interface AccountInfoProps {
  onLogin: () => void;
  onLogout: () => void;
  onSteamLogout: () => void;
}

export function AccountInfo({
  onLogin,
  onLogout,
  onSteamLogout,
}: AccountInfoProps) {
  const authMode = useSettingsStore((s) => s.authMode);
  const authState = useAuthStore((s) => s.authState);
  const steamUser = useSteamStore((s) => s.user);
  const steamAccessToken = useSteamStore((s) => s.accessToken);

  if (authMode === "byond") {
    return (
      <AccountDisplay
        avatar="B"
        name="BYOND Authentication"
        status="Using BYOND's built-in auth"
      />
    );
  }

  if (authMode === "steam") {
    if (steamAccessToken) {
      return (
        <AccountDisplay
          avatar="S"
          name={steamUser?.display_name || "Steam User"}
          status="Logged in via Steam"
          action={{ label: "Logout", onClick: onSteamLogout }}
        />
      );
    }
    return (
      <AccountDisplay
        avatar="S"
        name={steamUser?.display_name || "Steam"}
        status="Click connect to authenticate"
      />
    );
  }

  if (authState.logged_in && authState.user) {
    const displayName =
      authState.user.name || authState.user.preferred_username || "User";
    return (
      <AccountDisplay
        avatar={displayName.charAt(0).toUpperCase()}
        name={displayName}
        status={authState.user.email || "Logged in"}
        action={{ label: "Logout", onClick: onLogout }}
      />
    );
  }

  return (
    <AccountDisplay
      avatar="?"
      name="Not logged in"
      status={authState.loading ? "Checking..." : "Click to authenticate"}
      action={{ label: "Login", onClick: onLogin, primary: true }}
    />
  );
}
