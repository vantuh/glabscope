export function isQuitKey(name: string | undefined): boolean {
  return name === "q";
}

/** The modifier flags OpenTUI reports on a key event (ParsedKey subset). */
type KeyChord = {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  option?: boolean;
  super?: boolean;
};

/** Ctrl+R restarts a job; bare `r` stays the manual refresh key. */
export function isRetryKey(key: KeyChord): boolean {
  return (
    key.name === "r" &&
    key.ctrl === true &&
    !key.meta &&
    !key.shift &&
    !key.option &&
    !key.super
  );
}
