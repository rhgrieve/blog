#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const CONTENT_DIR = join(import.meta.dirname, "..", "src", "content");

const today = () => new Date().toISOString().slice(0, 10);

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const templates = {
  writing(title, opts) {
    return [
      "---",
      `title: "${title}"`,
      `date: ${today()}`,
      `summary: ""`,
      `tags: [${(opts.tags || []).map((t) => `"${t}"`).join(", ")}]`,
      `draft: true`,
      "---",
      "",
      "",
    ].join("\n");
  },

  note(_, opts) {
    return [
      "---",
      `date: ${today()}`,
      `tags: [${(opts.tags || []).map((t) => `"${t}"`).join(", ")}]`,
      "---",
      "",
      "",
    ].join("\n");
  },

  project(title, opts) {
    return [
      "---",
      `title: "${title}"`,
      `date: ${today()}`,
      `summary: ""`,
      `tags: [${(opts.tags || []).map((t) => `"${t}"`).join(", ")}]`,
      `status: ${opts.status || "wip"}`,
      "---",
      "",
      "",
    ].join("\n");
  },
};

const dirs = {
  writing: "writing",
  note: "notes",
  project: "projects",
};

const needsTitle = { writing: true, note: false, project: true };

const usage = `usage: pnpm new <writing|note|project> [title] [--tags tag1,tag2] [--status active|archived|wip]

examples:
  pnpm new writing "my cool post" --tags craft,tools
  pnpm new note --tags craft
  pnpm new project "side project" --status wip`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    tags: { type: "string" },
    status: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

const [type, title] = positionals;

if (values.help || !type) {
  console.log(usage);
  process.exit(!type && !values.help ? 1 : 0);
}

if (!templates[type]) {
  console.error(`unknown type: ${type}. must be one of: writing, note, project`);
  process.exit(1);
}

if (needsTitle[type] && !title) {
  console.error(`${type} requires a title`);
  process.exit(1);
}

const opts = {
  tags: values.tags ? values.tags.split(",").map((t) => t.trim()) : [],
  status: values.status,
};

const slug = needsTitle[type] ? slugify(title) : randomUUID().slice(0, 8);
const dir = join(CONTENT_DIR, dirs[type]);
const filePath = join(dir, `${slug}.md`);

if (existsSync(filePath)) {
  console.error(`file already exists: ${filePath}`);
  process.exit(1);
}

const content = templates[type](title, opts);
writeFileSync(filePath, content);

console.log(`created ${filePath.replace(process.cwd() + "/", "")}`);
