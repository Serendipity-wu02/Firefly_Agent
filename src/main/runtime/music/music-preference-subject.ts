import type { MusicTrackObservation } from "../../../shared/music-context-types";
import type {
  MusicArtistPreferenceSubject,
  MusicPreferenceSubject,
  MusicTrackPreferenceSubject,
} from "../../../shared/music-preference-types";

export function normalizeMusicSubjectText(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ");
}

function semanticPart(value: string): string {
  return normalizeMusicSubjectText(value).toLowerCase();
}

export function createMusicArtistSubject(
  artist: string,
): MusicArtistPreferenceSubject | undefined {
  const displayArtist = normalizeMusicSubjectText(artist);
  if (!displayArtist) return undefined;
  return Object.freeze({
    type: "ARTIST",
    key: `artist:${semanticPart(displayArtist)}`,
    artist: displayArtist,
  });
}

export function createMusicTrackSubject(
  track: MusicTrackObservation,
): MusicTrackPreferenceSubject | undefined {
  const title = normalizeMusicSubjectText(track.title);
  const artist = normalizeMusicSubjectText(track.artist);
  const album = track.album ? normalizeMusicSubjectText(track.album) : undefined;
  if (!title || !artist) return undefined;

  const semanticTuple = JSON.stringify([
    semanticPart(artist),
    semanticPart(title),
    album ? semanticPart(album) : "",
  ]);
  return Object.freeze({
    type: "TRACK",
    key: `track:${semanticTuple}`,
    title,
    artist,
    ...(album ? { album } : {}),
  });
}

export function normalizeMusicPreferenceSubject(
  subject: MusicPreferenceSubject,
): MusicPreferenceSubject | undefined {
  return subject.type === "ARTIST"
    ? createMusicArtistSubject(subject.artist)
    : createMusicTrackSubject(subject);
}
