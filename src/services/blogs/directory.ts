/**
 * The blogs Explore offers, by section. Pure data.
 *
 * Chosen for what Open Citadel is for: learning, thinking and doing the work.
 * Every feed here was checked to answer with a feed, and to be free to read:
 * publications whose posts sit behind a paywall are left out, since a reader
 * could follow them and read nothing. Anything else can be added by its
 * address.
 *
 * A publisher who asks to be left out (`explore: false` in
 * `samwell-shared/publishers.ts`) is, through `listedDirectory`, without an
 * app release.
 */
import { publisherPermissions, type PublisherRule } from 'samwell-shared';

export type DirectoryBlog = {
  title: string;
  feedUrl: string;
  /** One plain line on what it is. */
  blurb: string;
  /**
   * The blog's own square icon, where it publishes one worth drawing (180px
   * or more), checked when the directory was written. Left off where a site
   * has only a tiny favicon: its initials in the serif read better than a
   * blurred sixteen pixels.
   */
  imageUrl?: string;
};

export type DirectorySection = {
  id: string;
  label: string;
  blogs: DirectoryBlog[];
};

export const BLOG_DIRECTORY: DirectorySection[] = [
  {
    id: 'ideas',
    label: 'Ideas and essays',
    blogs: [
      { title: 'Farnam Street', feedUrl: 'https://fs.blog/feed/', blurb: 'Mental models and clear thinking.', imageUrl: 'https://fs.blog/wp-content/uploads/2015/06/cropped-farnamstreet-300x300.png' },
      { title: 'The Marginalian', feedUrl: 'https://www.themarginalian.org/feed/', blurb: 'Maria Popova on art, science and meaning.', imageUrl: 'https://i0.wp.com/www.themarginalian.org/wp-content/uploads/2021/10/cropped-tm_site_icon-1.png?fit=180%2C180&ssl=1' },
      { title: 'Aeon', feedUrl: 'https://aeon.co/feed.rss', blurb: 'Long essays on ideas that matter.' },
      { title: 'Wait But Why', feedUrl: 'https://waitbutwhy.com/feed', blurb: 'Big questions, drawn out slowly.' },
      { title: 'Experimental History', feedUrl: 'https://experimentalhistory.substack.com/feed', blurb: 'Adam Mastroianni on science and how we think.', imageUrl: 'https://substackcdn.com/image/fetch/$s_!tElF!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-e05bbc84-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F36c752b6-28bc-4862-82e8-e4d2a5f2cdbc%2Fapple-touch-icon-1024x1024.png' },
      { title: 'Escaping Flatland', feedUrl: 'https://www.henrikkarlsson.xyz/feed', blurb: 'Henrik Karlsson on learning and a good life.', imageUrl: 'https://substackcdn.com/image/fetch/$s_!GYj5!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F212e611c-82bd-4622-a8dc-5cbd2695c8a2%2Fapple-touch-icon-1024x1024.png' },
      { title: 'Longreads', feedUrl: 'https://longreads.com/feed/', blurb: 'The best long-form writing, gathered.', imageUrl: 'https://i0.wp.com/longreads.com/wp-content/uploads/2017/01/longreads-logo-sm-rgb.png?fit=180%2C180&quality=80&ssl=1' },
      { title: 'Astral Codex Ten', feedUrl: 'https://www.astralcodexten.com/feed', blurb: 'Scott Alexander on reasoning and society.', imageUrl: 'https://substackcdn.com/image/fetch/$s_!o6Of!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-e05bbc84-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F8c00a032-defa-44b7-9ab7-b7cc6d88db75%2Fapple-touch-icon-1024x1024.png' },
    ],
  },
  {
    id: 'philosophy',
    label: 'Philosophy',
    blogs: [
      { title: '1000-Word Philosophy', feedUrl: 'https://1000wordphilosophy.com/feed/', blurb: 'Big philosophical ideas in a thousand words.', imageUrl: 'https://i0.wp.com/1000wordphilosophy.com/wp-content/uploads/2017/11/cropped-square.jpg?fit=180%2C180&ssl=1' },
      { title: 'Daily Stoic', feedUrl: 'https://dailystoic.com/feed/', blurb: 'Stoic ideas for everyday life.', imageUrl: 'https://dailystoic.com/wp-content/uploads/2020/01/cropped-7-180x180.png' },
      { title: 'Modern Stoicism', feedUrl: 'https://modernstoicism.com/feed/', blurb: 'Stoicism practised today.' },
      { title: "The Philosophers' Magazine", feedUrl: 'https://www.philosophersmag.com/feed', blurb: 'Philosophy for curious readers.' },
      { title: 'Daily Nous', feedUrl: 'https://dailynous.com/feed/', blurb: 'News and debate from the philosophy world.' },
      { title: 'The Point', feedUrl: 'https://thepointmag.com/feed/', blurb: 'A magazine of philosophy and culture.' },
    ],
  },
  {
    id: 'mind',
    label: 'The mind',
    blogs: [
      { title: 'Psyche', feedUrl: 'https://psyche.co/feed.rss', blurb: 'Psychology and philosophy for living well.' },
      { title: 'Ness Labs', feedUrl: 'https://nesslabs.com/feed', blurb: 'Anne-Laure Le Cunff on thinking and learning.', imageUrl: 'https://nesslabs.com/wp-content/uploads/2018/09/cropped-favicon-ness-180x180.png' },
      { title: 'Raptitude', feedUrl: 'https://www.raptitude.com/feed/', blurb: 'David Cain on being human, better.' },
      { title: 'PsyPost', feedUrl: 'https://www.psypost.org/feed/', blurb: 'New psychology research, explained.', imageUrl: 'https://sp-ao.shortpixel.ai/client/to_webp,q_glossy,ret_img,w_180,h_180/https://www.psypost.org/wp-content/uploads/2022/03/cropped-PsyPost-blue-brain-logo-no-name-180x180.png' },
      { title: 'Rob Henderson', feedUrl: 'https://www.robkhenderson.com/feed', blurb: 'Psychology, status and social class.', imageUrl: 'https://substackcdn.com/image/fetch/$s_!xMBx!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fb086e97c-7d83-4264-b7a3-cf251819fae3%2Fapple-touch-icon-1024x1024.png' },
    ],
  },
  {
    id: 'craft',
    label: 'Habits and craft',
    blogs: [
      { title: 'James Clear', feedUrl: 'https://jamesclear.com/feed', blurb: 'Habits, decisions and continuous improvement.', imageUrl: 'https://jamesclear.com/wp-content/uploads/2020/11/cropped-icon-180x180.png' },
      { title: 'Cal Newport', feedUrl: 'https://calnewport.com/feed/', blurb: 'Deep work in a distracted world.', imageUrl: 'https://calnewport.com/wp-content/uploads/2022/10/cropped-cal-newport-favicon-512x512-1-180x180.png' },
      { title: 'Scott H Young', feedUrl: 'https://www.scotthyoung.com/blog/feed/', blurb: 'How to learn faster and better.', imageUrl: 'https://www.scotthyoung.com/apple-touch-icon.png' },
      { title: 'Seth Godin', feedUrl: 'https://seths.blog/feed/', blurb: 'A short daily note on work that matters.', imageUrl: 'https://seths.blog/wp-content/themes/godin/img/favicons/apple-touch-icon.png' },
      { title: 'Austin Kleon', feedUrl: 'https://austinkleon.com/feed/', blurb: 'Creativity, notebooks and making things.', imageUrl: 'https://austinkleon.com/wp-content/uploads/2018/09/cropped-kleon-200px-180x180.jpg' },
      { title: 'Derek Sivers', feedUrl: 'https://sive.rs/en.atom', blurb: 'Short, direct lessons on life and work.' },
    ],
  },
  {
    id: 'science',
    label: 'Science',
    blogs: [
      { title: 'Quanta Magazine', feedUrl: 'https://api.quantamagazine.org/feed/', blurb: 'Maths, physics and biology, clearly told.', imageUrl: 'https://www.quantamagazine.org/wp-content/themes/quanta2024/frontend/images/apple-touch-icon.png' },
      { title: 'Nautilus', feedUrl: 'https://nautil.us/feed/', blurb: 'Science connected to culture.', imageUrl: 'https://lede-admin.nautil.us/wp-content/uploads/sites/70/sites/3/nautilus/cropped-thicker_smaller_logo.png' },
      { title: 'Big Think', feedUrl: 'https://bigthink.com/feed/', blurb: 'Ideas from science and the people behind them.', imageUrl: 'https://bigthink.com/wp-content/uploads/2023/06/cropped-bt-icon-512x512-1-1.png?quality=80&w=256' },
      { title: 'Construction Physics', feedUrl: 'https://www.construction-physics.com/feed', blurb: 'How we build, and why it costs what it does.', imageUrl: 'https://substackcdn.com/image/fetch/$s_!m9i4!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F996cb600-c77d-471b-ac46-8a9a3aac5709%2Fapple-touch-icon-1024x1024.png' },
      { title: 'Asterisk', feedUrl: 'https://asteriskmag.com/feed', blurb: 'A quarterly of essays on big problems.', imageUrl: 'https://asteriskmag.com/assets/favicon/apple-touch-icon.png' },
    ],
  },
  {
    id: 'history',
    label: 'History and culture',
    blogs: [
      { title: 'The Public Domain Review', feedUrl: 'https://publicdomainreview.org/rss.xml', blurb: 'Curious works from the history of ideas.', imageUrl: 'https://publicdomainreview.org/apple-icon-180x180.png' },
      { title: 'JSTOR Daily', feedUrl: 'https://daily.jstor.org/feed/', blurb: 'The news, read through scholarship.', imageUrl: 'https://daily.jstor.org/wp-content/uploads/2016/05/JSTOR_Daily_logo_square-copy-300x300.jpg' },
      { title: 'Smithsonian: History', feedUrl: 'https://www.smithsonianmag.com/rss/history/', blurb: 'Stories from the past, well told.' },
      { title: 'Open Culture', feedUrl: 'https://www.openculture.com/feed', blurb: 'Free culture and learning from across the web.', imageUrl: 'https://www.openculture.com/wp-content/themes/openculture_v4a/images/apple_icon_new.png' },
      { title: 'Literary Hub', feedUrl: 'https://lithub.com/feed/', blurb: 'Books, writers and reading.' },
    ],
  },
  {
    id: 'money',
    label: 'Money and the economy',
    blogs: [
      { title: 'Marginal Revolution', feedUrl: 'https://marginalrevolution.com/feed', blurb: 'Tyler Cowen and Alex Tabarrok on economics.', imageUrl: 'https://marginalrevolution.com/wp-content/uploads/2015/10/cropped-MR-logo-thumbnail-180x180.png' },
      { title: 'Of Dollars and Data', feedUrl: 'https://ofdollarsanddata.com/feed/', blurb: 'Personal finance, backed by data.', imageUrl: 'https://ofdollarsanddata.com/wp-content/uploads/2020/06/cropped-small_logo_only-180x180.jpg' },
      { title: 'A Wealth of Common Sense', feedUrl: 'https://awealthofcommonsense.com/feed/', blurb: 'Investing, kept simple.' },
      { title: 'Mr. Money Mustache', feedUrl: 'https://www.mrmoneymustache.com/feed/', blurb: 'Frugality and financial freedom.' },
      { title: 'Noahpinion', feedUrl: 'https://www.noahpinion.blog/feed', blurb: 'Noah Smith on economics and the world.', imageUrl: 'https://substackcdn.com/image/fetch/$s_!RLLl!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-e05bbc84-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2Fa242bd04-28e0-4418-8968-e96e069a8358%2Fapple-touch-icon-1024x1024.png' },
    ],
  },
  {
    id: 'technology',
    label: 'Technology',
    blogs: [
      { title: 'Simon Willison', feedUrl: 'https://simonwillison.net/atom/everything/', blurb: 'AI and software, tried out in the open.' },
      { title: 'Benedict Evans', feedUrl: 'https://www.ben-evans.com/benedictevans?format=rss', blurb: 'How technology changes business.', imageUrl: 'https://images.squarespace-cdn.com/content/v1/50363cf324ac8e905e7df861/ebdb4645-db93-4967-881d-db698ee59c2c/favicon.ico?format=300w' },
      { title: 'Julia Evans', feedUrl: 'https://jvns.ca/atom.xml', blurb: 'Computers, explained with delight.' },
      { title: 'Dan Luu', feedUrl: 'https://danluu.com/atom.xml', blurb: 'Careful essays on software and work.' },
      { title: 'Daring Fireball', feedUrl: 'https://daringfireball.net/feeds/main', blurb: 'John Gruber on Apple and technology.', imageUrl: 'https://daringfireball.net/graphics/apple-touch-icon.png' },
    ],
  },
];

/** Every blog in the directory, once, for searching. */
export const DIRECTORY_BLOGS: DirectoryBlog[] = BLOG_DIRECTORY.flatMap((section) => section.blogs);

/** The directory without the blogs whose publishers asked to be left out, and without a section they emptied. Pure. */
export function listedDirectory(sections: readonly DirectorySection[], rules: readonly PublisherRule[]): DirectorySection[] {
  if (!rules.some((rule) => rule.explore === false)) return [...sections];
  return sections
    .map((section) => ({ ...section, blogs: section.blogs.filter((blog) => publisherPermissions(blog.feedUrl, rules).explore) }))
    .filter((section) => section.blogs.length > 0);
}
