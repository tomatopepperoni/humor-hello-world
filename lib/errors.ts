/** Split "Message. (Tried: a 503, b 503)" into the sentence people read and the technical tail. */
export function splitErrorDetail(error: string): { message: string; detail: string | null } {
  const i = error.indexOf(" (Tried: ");
  if (i === -1) return { message: error, detail: null };
  return { message: error.slice(0, i), detail: error.slice(i + 2, -1) };
}
