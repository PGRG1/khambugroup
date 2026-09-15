import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

const createItem = vi.fn();
const items = [
  { id: "1", code: "Case", label: "Case", uom_type: "purchase", sort_order: 0, is_active: true },
  { id: "2", code: "Bottle", label: "Bottle", uom_type: "stock", sort_order: 0, is_active: true },
];

vi.mock("@/hooks/useUomOptions", () => ({
  useUomOptions: () => ({ items, createItem, loading: false, fetchAll: vi.fn(), updateItem: vi.fn(), deleteItem: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import UomSelect from "@/components/procurement/UomSelect";

function Harness({ allowCreate, type = "purchase" as const }: { allowCreate?: boolean; type?: "purchase" | "stock" | "base" }) {
  const [value, setValue] = React.useState("");
  return (
    <div>
      <UomSelect type={type} value={value} onChange={setValue} allowCreate={allowCreate} />
      <span data-testid="current-value">{value}</span>
    </div>
  );
}

async function openDropdown() {
  fireEvent.pointerDown(
    screen.getByRole("combobox"),
    new (window as any).PointerEvent("pointerdown", { bubbles: true, button: 0, ctrlKey: false }),
  );
  await waitFor(() => expect(screen.getByRole("listbox")).toBeInTheDocument());
}

beforeEach(() => {
  createItem.mockReset();
  (window as any).PointerEvent = MouseEvent as any;
  (Element.prototype as any).hasPointerCapture = () => false;
  (Element.prototype as any).setPointerCapture = () => {};
  (Element.prototype as any).releasePointerCapture = () => {};
  (Element.prototype as any).scrollIntoView = () => {};
});

describe("UomSelect inline UOM creation", () => {
  it("hides the create action unless allowCreate is enabled", async () => {
    render(<Harness />);
    await openDropdown();
    expect(screen.queryByTestId("uom-add-new-purchase")).toBeNull();
  });

  it("shows the create action when enabled and passes the field's UOM type to createItem", async () => {
    createItem.mockResolvedValue({ id: "9", code: "Bot", label: "Bottle", uom_type: "stock", sort_order: 0, is_active: true });
    render(<Harness allowCreate type="stock" />);
    await openDropdown();
    fireEvent.click(screen.getByTestId("uom-add-new-stock"));

    fireEvent.change(screen.getByLabelText("Unit name *"), { target: { value: "Bottle" } });
    fireEvent.change(screen.getByLabelText("Unit code *"), { target: { value: "Bot" } });
    fireEvent.click(screen.getByRole("button", { name: "Add unit" }));

    await waitFor(() => expect(createItem).toHaveBeenCalledWith({ code: "Bot", label: "Bottle", uom_type: "stock" }));
    // Successful create selects the new code and closes the form.
    await waitFor(() => expect(screen.getByTestId("current-value").textContent).toBe("Bot"));
    await waitFor(() => expect(screen.queryByText("Add new unit")).toBeNull());
  });

  it("keeps the form open with a visible error when creation fails", async () => {
    createItem.mockResolvedValue(null);
    render(<Harness allowCreate />);
    await openDropdown();
    fireEvent.click(screen.getByTestId("uom-add-new-purchase"));

    fireEvent.change(screen.getByLabelText("Unit name *"), { target: { value: "Kilogram" } });
    fireEvent.change(screen.getByLabelText("Unit code *"), { target: { value: "KG" } });
    fireEvent.click(screen.getByRole("button", { name: "Add unit" }));

    await waitFor(() => expect(screen.getByTestId("uom-add-error-purchase")).toBeInTheDocument());
    expect(screen.getByLabelText("Unit code *")).toHaveValue("KG");
    expect(screen.getByTestId("current-value").textContent).toBe("");
  });
});
