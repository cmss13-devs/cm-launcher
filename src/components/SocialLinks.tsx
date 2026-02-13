import { faDiscord, faTwitch } from "@fortawesome/free-brands-svg-icons";
import { faBook, faComments } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { invoke } from "@tauri-apps/api/core";

const socialLinks = [
  {
    name: "Discord",
    url: "https://discord.gg/cmss13",
    icon: faDiscord,
  },
  {
    name: "Twitch",
    url: "https://twitch.tv/cm_ss13",
    icon: faTwitch,
  },
  {
    name: "Forums",
    url: "https://forum.cm-ss13.com",
    icon: faComments,
  },
  {
    name: "Wiki",
    url: "https://cm-ss13.com/wiki",
    icon: faBook,
  },
];

export function SocialLinks() {
  const handleClick = async (url: string) => {
    await invoke("open_url", { url });
  };

  return (
    <div className="social-links">
      {socialLinks.map((link) => (
        <button
          key={link.name}
          type="button"
          className="social-link-button"
          onClick={() => handleClick(link.url)}
          title={link.name}
        >
          <FontAwesomeIcon icon={link.icon} className="social-link-icon" />
        </button>
      ))}
    </div>
  );
}
