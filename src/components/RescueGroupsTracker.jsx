import { getRescueGroupsTrackerUrl } from "../lib/rescueGroupsTracker";

export default function RescueGroupsTracker({ dog }) {
  const url = getRescueGroupsTrackerUrl(dog);
  if (!url) return null;

  return (
    <img
      data-rescuegroups-tracker="true"
      src={url}
      alt=""
      width="1"
      height="1"
      aria-hidden="true"
      referrerPolicy="no-referrer-when-downgrade"
      className="pointer-events-none absolute h-px w-px opacity-0"
      onError={(event) => { event.currentTarget.hidden = true; }}
    />
  );
}
