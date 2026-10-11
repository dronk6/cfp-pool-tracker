import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TeamLogo from "./TeamLogo";

const ESPN = "https://a.espncdn.com/i/teamlogos/ncaa/500/103.png";

describe("TeamLogo", () => {
  it("renders an allowed logo as a decorative image with fixed dimensions", () => {
    const { container } = render(<TeamLogo imageUrl={ESPN} />);
    const img = container.querySelector("img");

    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("width", "32");
    expect(img).toHaveAttribute("height", "32");
    expect(img).toHaveAttribute("loading", "lazy");
  });

  it("can load eagerly", () => {
    const { container } = render(<TeamLogo imageUrl={ESPN} eager />);

    expect(container.querySelector("img")).toHaveAttribute("loading", "eager");
  });

  it.each([null, "https://evil.test/i/teamlogos/ncaa/500/103.png"])(
    "renders only the empty placeholder box for %s",
    (imageUrl) => {
      const { container } = render(<TeamLogo imageUrl={imageUrl} />);

      expect(container.querySelector("img")).toBeNull();
      expect(container.firstElementChild).not.toBeNull();
    },
  );
});
