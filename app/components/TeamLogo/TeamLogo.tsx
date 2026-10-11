import Image from "next/image";
import { allowedLogoSrc } from "../../../lib/team-logo";
import styles from "./TeamLogo.module.css";

const SIZE = 32;

type Props = {
  imageUrl: string | null;
  /** Load immediately instead of lazily; use for logos in the first view. */
  eager?: boolean;
};

/**
 * A small team logo. The name is always shown next to it, so the image is
 * decorative (empty alt). The box is a fixed size and always rendered, so rows
 * stay aligned with no layout shift when the logo is missing, not allowed, or
 * fails to load. Hiding the browser's broken-image icon is best effort (see the
 * CSS): checked by hand in Chromium, and Safari may still show the icon.
 * No hooks or handlers: usable from server and client components.
 */
export default function TeamLogo({ imageUrl, eager = false }: Props) {
  const src = allowedLogoSrc(imageUrl);
  return (
    <span className={styles.logo} aria-hidden="true">
      {src && (
        <Image
          src={src}
          alt=""
          width={SIZE}
          height={SIZE}
          loading={eager ? "eager" : "lazy"}
          className={styles.image}
        />
      )}
    </span>
  );
}
