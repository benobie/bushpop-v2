export { cn } from "./lib/cn";
export { Button, buttonVariants, type ButtonProps } from "./primitives/button";
export { Input, type InputProps } from "./primitives/input";
export {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
} from "./primitives/card";
export { Textarea, type TextareaProps } from "./primitives/textarea";
export { Label } from "./primitives/label";
export { Badge, badgeVariants, type BadgeProps } from "./primitives/badge";
export { Avatar, AvatarImage, AvatarFallback } from "./primitives/avatar";
export { Skeleton } from "./primitives/skeleton";
export { VisuallyHidden } from "./primitives/visually-hidden";
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "./primitives/select";

// Checkout-scoped compositions (U1) — pure Tailwind+token, no matching bp-*
// CSS class, so they don't fit either grouping above.
export { SummaryRow, type SummaryRowProps } from "./primitives/summary-row";
export { Banner, type BannerProps } from "./primitives/banner";

// Lit Glass (U0 design system) — design/home/bushpop.css port
export { Chip, type ChipProps } from "./primitives/chip";
export { Tgl, type TglProps } from "./primitives/tgl";
export { Tlink, type TlinkProps } from "./primitives/tlink";
export { FoilBadge, foilBadgeVariants, type FoilBadgeProps } from "./primitives/foil-badge";
export { Pcard, type PcardProps } from "./primitives/pcard";
export { Rail, RailItem, type RailProps, type RailItemProps } from "./primitives/rail";
export { SiteNav, type SiteNavProps, type NavCategory } from "./primitives/site-nav";
export { SiteFooter, type SiteFooterProps, type SiteFooterColumn } from "./primitives/site-footer";
export {
  MobileBottomBar,
  type MobileBottomBarProps,
  type MobileBottomBarItem,
} from "./primitives/mobile-bottom-bar";
export { SouthernCrossIcon, TrendIcon, HandHeartIcon, type CustomIconProps } from "./icons/custom";
export {
  MenuIcon,
  CloseIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  SearchIcon,
  HeartIcon,
  ChatIcon,
  PlusCircleIcon,
  ChevronDownIcon,
  BagOutlineIcon,
  BagFillIcon,
  HouseIcon,
  UserIcon,
  LockIcon,
  ShieldIcon,
  CheckIcon,
} from "./icons/nav-icons";
export { useCursorLight } from "./lib/use-cursor-light";
export { useNavScrolled } from "./lib/use-nav-scrolled";
export { spawnBurst } from "./lib/spawn-burst";
