import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProductAutocomplete from "@/components/invoices/ProductAutocomplete";

const products = Array.from({ length: 12 }).map((_, i) => ({
  id: `p-${i}`,
  internal_sku: `INT-${i}`,
  external_sku: `EXT-${i}`,
  internal_product_name: `Internal Product ${i}`,
  supplier_product_name: `Supplier Product ${i}`,
  supplier: "Test Supplier",
  purchase_unit_cost: 10 + i,
}));

function renderInScrollable() {
  const parent = document.createElement("div");
  parent.style.overflow = "auto";
  parent.style.width = "400px";
  parent.style.height = "200px";
  document.body.appendChild(parent);

  const { unmount, container } = render(
    <div data-testid="scrollable-parent" style={{ width: "800px", height: "800px" }}>
      <ProductAutocomplete
        value=""
        onChange={() => {}}
        onSelect={() => {}}
        products={products}
        searchField="name"
        placeholder="Search product"
      />
    </div>,
    { container: parent }
  );

  const scrollable = screen.getByTestId("scrollable-parent").parentElement as HTMLElement;
  scrollable.scrollLeft = 50;
  scrollable.scrollTop = 60;

  const getSuggestions = () =>
    Array.from(container.querySelectorAll("button[type='button']")).filter((b) =>
      b.textContent?.includes("Supplier Product")
    );

  return { unmount, scrollable, getSuggestions };
}

describe("ProductAutocomplete scroll isolation", () => {
  let scrollIntoViewSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = () => {};
    }
    scrollIntoViewSpy = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
  });

  afterEach(() => {
    scrollIntoViewSpy?.mockRestore();
  });

  it("does not call scrollIntoView and preserves parent scroll position while navigating suggestions", () => {
    const { scrollable, unmount, getSuggestions } = renderInScrollable();

    const input = screen.getByPlaceholderText("Search product");
    fireEvent.change(input, { target: { value: "Supplier" } });
    fireEvent.focus(input);

    expect(getSuggestions().length).toBeGreaterThan(0);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowDown" });

    expect(scrollIntoViewSpy).not.toHaveBeenCalled();
    expect(scrollable.scrollLeft).toBe(50);
    expect(scrollable.scrollTop).toBe(60);

    unmount();
  });

  it("keeps parent scroll position when hovering suggestions", () => {
    const { scrollable, unmount, getSuggestions } = renderInScrollable();

    const input = screen.getByPlaceholderText("Search product");
    fireEvent.change(input, { target: { value: "Product 5" } });
    fireEvent.focus(input);

    const suggestions = getSuggestions();
    expect(suggestions.length).toBeGreaterThan(0);

    fireEvent.mouseEnter(suggestions[0]);
    fireEvent.mouseEnter(suggestions[suggestions.length - 1]);

    expect(scrollIntoViewSpy).not.toHaveBeenCalled();
    expect(scrollable.scrollLeft).toBe(50);
    expect(scrollable.scrollTop).toBe(60);

    unmount();
  });
});
