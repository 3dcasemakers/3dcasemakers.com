// Displays a name with each word's first letter capitalized and the rest
// lower-cased — e.g. "MURUGAN ACRYLIC STRONG CASES" -> "Murugan Acrylic Strong Cases".
// Leaves already-mixed-case names (like brand names or acronyms the admin
// typed deliberately, e.g. "TVK") readable by only touching all-caps/all-lower words.
export function titleCase(input?: string | null): string {
  if (!input) return "";
  return input
    .split(" ")
    .map((word) => {
      if (!word) return word;
      // Keep short all-caps acronyms (2-4 letters, e.g. "TVK") as-is
      if (word.length <= 4 && word === word.toUpperCase() && /[A-Z]/.test(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}
