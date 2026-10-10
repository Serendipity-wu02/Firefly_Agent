import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TodoPanel } from "./TodoPanel";

const render = (todos: { id: string; content: string; status: "pending" | "completed" }[]) => {
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  return renderToStaticMarkup(React.createElement(TodoPanel, { state: { updatedAt: 1, todos } }));
};

describe("TodoPanel", () => {
  it("shows the count in the heading and keeps the progress bar outside the scrollable list", () => {
    const html = render(Array.from({ length: 20 }, (_, index) => ({ id: `todo-${index}`, content: `任务 ${index}`, status: index === 0 ? "completed" as const : "pending" as const })));
    expect(html).toContain("1/20");
    const listEnd = html.indexOf("</ul>", html.indexOf('data-testid="todo-list"'));
    const footerStart = html.indexOf('data-testid="todo-footer"');
    expect(footerStart).toBeGreaterThan(listEnd);
    expect(html.slice(footerStart)).toContain('role="progressbar"');
    expect(html.slice(footerStart)).toContain("5%");
  });
  it("has no coming-soon placeholder, mode capsule or progress bar when there are no tasks", () => {
    const html = render([]);
    expect(html).toContain("0/0");
    expect(html).toContain("cy-todo__item--empty");
    expect(html).not.toContain("progressbar");
    expect(html).not.toContain("即将接入");
    expect(html).not.toContain("cy-todo__mode");
  });
});
