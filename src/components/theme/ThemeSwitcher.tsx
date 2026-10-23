interface Props {
  size?: "sm" | "md";
  className?: string;
}

// Retain the component API for existing imports without offering theme choices.
export const ThemeSwitcher = (_props: Props) => null;
