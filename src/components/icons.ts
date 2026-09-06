// Every icon the app draws, one deep import each.
//
// `import { Compass } from 'lucide-react-native'` reaches the package barrel,
// and Metro does not tree-shake. That barrel put 1,749 icon modules into the
// bundle for the 70 we actually draw - a third of every module in the app -
// and evaluates all of them the moment anything renders an icon. A deep import
// costs one module.
//
// To add an icon: find its file in node_modules/lucide-react-native/dist/esm/
// icons/ (kebab-case) and add a line below. Import from here, never from
// 'lucide-react-native' directly.

export { default as Archive } from 'lucide-react-native/icons/archive';
export { default as ArrowBigDownDash } from 'lucide-react-native/icons/arrow-big-down-dash';
export { default as ArrowBigUpDash } from 'lucide-react-native/icons/arrow-big-up-dash';
export { default as ArrowLeft } from 'lucide-react-native/icons/arrow-left';
export { default as ArrowRight } from 'lucide-react-native/icons/arrow-right';
export { default as AudioLines } from 'lucide-react-native/icons/audio-lines';
export { default as Award } from 'lucide-react-native/icons/award';
export { default as BookOpen } from 'lucide-react-native/icons/book-open';
export { default as Bookmark } from 'lucide-react-native/icons/bookmark';
export { default as BookmarkCheck } from 'lucide-react-native/icons/bookmark-check';
export { default as Calendar } from 'lucide-react-native/icons/calendar';
export { default as CalendarCheck2 } from 'lucide-react-native/icons/calendar-check-2';
export { default as CalendarClock } from 'lucide-react-native/icons/calendar-clock';
export { default as CalendarDays } from 'lucide-react-native/icons/calendar-days';
export { default as CalendarX2 } from 'lucide-react-native/icons/calendar-x-2';
export { default as ChartNoAxesGantt } from 'lucide-react-native/icons/chart-no-axes-gantt';
export { default as Check } from 'lucide-react-native/icons/check';
export { default as ChevronDown } from 'lucide-react-native/icons/chevron-down';
export { default as ChevronLeft } from 'lucide-react-native/icons/chevron-left';
export { default as ChevronRight } from 'lucide-react-native/icons/chevron-right';
export { default as ChevronUp } from 'lucide-react-native/icons/chevron-up';
export { default as CircleCheck } from 'lucide-react-native/icons/circle-check';
export { default as CircleCheckBig } from 'lucide-react-native/icons/circle-check-big';
export { default as CircleMinus } from 'lucide-react-native/icons/circle-minus';
export { default as CircleStar } from 'lucide-react-native/icons/circle-star';
export { default as CircleX } from 'lucide-react-native/icons/circle-x';
export { default as Clock } from 'lucide-react-native/icons/clock';
export { default as Cloud } from 'lucide-react-native/icons/cloud';
export { default as Coins } from 'lucide-react-native/icons/coins';
export { default as Compass } from 'lucide-react-native/icons/compass';
export { default as Copy } from 'lucide-react-native/icons/copy';
export { default as Download } from 'lucide-react-native/icons/download';
export { default as FolderPlus } from 'lucide-react-native/icons/folder-plus';
export { default as Goal } from 'lucide-react-native/icons/goal';
export { default as Highlighter } from 'lucide-react-native/icons/highlighter';
export { default as History } from 'lucide-react-native/icons/history';
export { default as Info } from 'lucide-react-native/icons/info';
export { default as LibraryBig } from 'lucide-react-native/icons/library-big';
export { default as Lightbulb } from 'lucide-react-native/icons/lightbulb';
export { default as List } from 'lucide-react-native/icons/list';
export { default as LogIn } from 'lucide-react-native/icons/log-in';
export { default as LogOut } from 'lucide-react-native/icons/log-out';
export { default as Lock } from 'lucide-react-native/icons/lock';
export { default as ListTodo } from 'lucide-react-native/icons/list-todo';
export { default as Mail } from 'lucide-react-native/icons/mail';
export { default as MemoryStick } from 'lucide-react-native/icons/memory-stick';
export { default as MessageCircleHeart } from 'lucide-react-native/icons/message-circle-heart';
export { default as MessageSquare } from 'lucide-react-native/icons/message-square';
export { default as MessageSquarePlus } from 'lucide-react-native/icons/message-square-plus';
export { default as Minus } from 'lucide-react-native/icons/minus';
export { default as Pause } from 'lucide-react-native/icons/pause';
export { default as Pencil } from 'lucide-react-native/icons/pencil';
export { default as PencilSparkles } from 'lucide-react-native/icons/pencil-sparkles';
export { default as Play } from 'lucide-react-native/icons/play';
export { default as Plus } from 'lucide-react-native/icons/plus';
export { default as Power } from 'lucide-react-native/icons/power';
export { default as RefreshCw } from 'lucide-react-native/icons/refresh-cw';
export { default as RotateCcw } from 'lucide-react-native/icons/rotate-ccw';
export { default as Search } from 'lucide-react-native/icons/search';
export { default as Send } from 'lucide-react-native/icons/send';
export { default as Settings } from 'lucide-react-native/icons/settings';
export { default as Shapes } from 'lucide-react-native/icons/shapes';
export { default as Share } from 'lucide-react-native/icons/share';
export { default as SkipBack } from 'lucide-react-native/icons/skip-back';
export { default as SkipForward } from 'lucide-react-native/icons/skip-forward';
export { default as SlidersHorizontal } from 'lucide-react-native/icons/sliders-horizontal';
export { default as Smartphone } from 'lucide-react-native/icons/smartphone';
export { default as Sparkles } from 'lucide-react-native/icons/sparkles';
export { default as Square } from 'lucide-react-native/icons/square';
export { default as SquareLibrary } from 'lucide-react-native/icons/square-library';
export { default as Star } from 'lucide-react-native/icons/star';
export { default as StarOff } from 'lucide-react-native/icons/star-off';
export { default as StickyNote } from 'lucide-react-native/icons/sticky-note';
export { default as Sun } from 'lucide-react-native/icons/sun';
export { default as Target } from 'lucide-react-native/icons/target';
export { default as Trash2 } from 'lucide-react-native/icons/trash-2';
export { default as TrendingDown } from 'lucide-react-native/icons/trending-down';
export { default as TrendingUp } from 'lucide-react-native/icons/trending-up';
export { default as Undo2 } from 'lucide-react-native/icons/undo-2';
export { default as User } from 'lucide-react-native/icons/user';
export { default as UserPlus } from 'lucide-react-native/icons/user-plus';
export { default as UserStar } from 'lucide-react-native/icons/user-star';
export { default as Volume2 } from 'lucide-react-native/icons/volume-2';
export { default as X } from 'lucide-react-native/icons/x';
export { default as ZodiacPisces } from 'lucide-react-native/icons/zodiac-pisces';

export type { LucideIcon } from 'lucide-react-native';
