import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const files = ["src/pages/admin/AdminDashboard.tsx", "src/pages/admin/AdminLogin.tsx", "src/components/admin/ImageCropModal.tsx", "src/components/admin/DragReorderList.tsx"];
let failures = 0;
for (const file of files) {
  const absolute = path.resolve(import.meta.dirname, "..", file);
  let source = fs.readFileSync(absolute, "utf8");
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const insertions = [];
  const replacements = [];
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(tree) === "button") {
      const attrs = node.attributes.properties.filter(ts.isJsxAttribute).map((attr) => attr.name.getText(tree));
      const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
      if (!attrs.includes("type")) {
        if (process.argv.includes("--fix-types")) insertions.push(node.tagName.end);
        else { console.error(`${file}:${line}: missing explicit button type`); failures++; }
      }
      if (!attrs.some((name) => ["onClick", "onPointerDown", "onKeyDown"].includes(name)) && !source.slice(node.pos, node.end).includes('type="submit"')) {
        if (process.argv.includes("--remove-placeholders")) {
          const element = node.parent;
          const text = element.getText(tree);
          if (text.includes("<Columns3")) replacements.push({ start: element.getStart(tree), end: element.end, text: "" });
          else if (text.includes("All <ChevronDown")) replacements.push({ start: element.getStart(tree), end: element.end, text: '<span className="shrink-0 px-2.5 py-1.5 text-sm font-semibold text-[#202223]">All</span>' });
          else { console.error(`${file}:${line}: button has no action`); failures++; }
          return;
        }
        console.error(`${file}:${line}: button has no action`);
        failures++;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  for (const at of insertions.sort((a, b) => b - a)) source = source.slice(0, at) + ' type="button"' + source.slice(at);
  if (replacements.length && insertions.length) throw new Error("Run type fixes and placeholder fixes separately.");
  for (const edit of replacements.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  if (insertions.length || replacements.length) fs.writeFileSync(absolute, source);
}
if (failures) process.exitCode = 1;
else console.log("Admin buttons: all controls have explicit type and an action.");
