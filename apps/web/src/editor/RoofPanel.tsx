import type { Room, RoofType } from "@keep/building-graph";
import { NumberField } from "./NumberField";

const ROOF_TYPES: { id: RoofType; label: string }[] = [
  { id: "flat", label: "Flat" },
  { id: "shed", label: "Shed" },
  { id: "gable", label: "Gable" },
  { id: "hip", label: "Hip" },
];

export function RoofPanel({
  rooms,
  onUpdateRoom,
}: {
  rooms: Room[];
  onUpdateRoom: (
    roomId: string,
    patch: Partial<Pick<Room, "hasFloor" | "hasRoof" | "roofType" | "roofPitchDegrees">>
  ) => void;
}) {
  if (rooms.length === 0) {
    return (
      <div className="roof-panel roof-panel--empty">
        Close a room (Rectangle Room or Draw Wall) and it'll appear here — floor and roof are on by
        default, both can be turned off for a fence or a platform.
      </div>
    );
  }

  return (
    <div className="roof-panel">
      <span className="roof-panel__label">Rooms on this floor:</span>
      {rooms.map((room, i) => (
        <div key={room.id} className="roof-panel__room">
          <span className="roof-panel__room-name">Room {i + 1}</span>
          <label className="roof-panel__has-roof">
            <input
              type="checkbox"
              checked={room.hasFloor}
              onChange={(e) => onUpdateRoom(room.id, { hasFloor: e.target.checked })}
            />
            Floor
          </label>
          <label className="roof-panel__has-roof">
            <input
              type="checkbox"
              checked={room.hasRoof}
              onChange={(e) => onUpdateRoom(room.id, { hasRoof: e.target.checked })}
            />
            Roof
          </label>
          {room.hasRoof && (
            <>
              <select
                value={room.roofType}
                onChange={(e) => onUpdateRoom(room.id, { roofType: e.target.value as RoofType })}
              >
                {ROOF_TYPES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
              {room.roofType !== "flat" && (
                <label className="roof-panel__pitch">
                  Pitch°
                  <NumberField
                    value={room.roofPitchDegrees}
                    onChange={(v) => onUpdateRoom(room.id, { roofPitchDegrees: v })}
                    step={1}
                    min={5}
                    max={60}
                  />
                </label>
              )}
            </>
          )}
          {!room.hasFloor && !room.hasRoof && <span className="roof-panel__no-roof-note">Fence — walls only</span>}
          {room.hasFloor && !room.hasRoof && <span className="roof-panel__no-roof-note">Platform — no roof</span>}
        </div>
      ))}
    </div>
  );
}
