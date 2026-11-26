import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { createPortal } from "react-dom";

let rtl: typeof import("@testing-library/react/pure");
let Dialog: typeof import("./dialog").Dialog;
const globals = globalThis as unknown as Record<string, unknown>;

beforeAll(async () => {
  // Only the DOM comes from happy-dom; timers stay Bun's (see lab-form.test.tsx).
  const native = { setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, queueMicrotask, MessageChannel };
  GlobalRegistrator.register({ url: "http://whiskerfile.test/" });
  Object.assign(globalThis, native);
  rtl = await import("@testing-library/react/pure");
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  ({ Dialog } = await import("./dialog"));
});

afterAll(async () => {
  rtl.cleanup();
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await GlobalRegistrator.unregister();
});

test("closing a dialog opened from inside another leaves the outer one open", () => {
  const closed: string[] = [];
  rtl.render(
    <Dialog open onClose={() => closed.push("outer")} title="Add vet visit">
      {/* As the vet picker does: inside the outer dialog in React, outside it in the document. */}
      {createPortal(
        <Dialog open onClose={() => closed.push("inner")} title="New vet">
          <p>Vet form</p>
        </Dialog>,
        document.body,
      )}
    </Dialog>,
  );
  const page = rtl.within(document.body);
  const [outer, inner] = [
    page.getByRole("dialog", { name: "Add vet visit" }),
    page.getByRole("dialog", { name: "New vet" }),
  ];

  rtl.fireEvent(inner, new Event("close"));
  expect(closed).toEqual(["inner"]);
  rtl.fireEvent(outer, new Event("close"));
  expect(closed).toEqual(["inner", "outer"]);
});
