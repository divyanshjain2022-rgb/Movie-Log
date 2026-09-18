// TMDB's community keywords flag scenes during and after the end credits.
// A missing tag doesn't prove there is no scene, so only a positive is shown.
export function creditsSceneLabel(keywords: string[] | null | undefined): string | null {
  if (!keywords) return null;
  const during = keywords.includes("duringcreditsstinger");
  const after = keywords.includes("aftercreditsstinger");
  if (during && after) return "Mid- and post-credits scenes";
  if (during) return "Mid-credits scene";
  if (after) return "Post-credits scene";
  return null;
}
