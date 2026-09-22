/**
 * The icons, as imports rather than paths.
 *
 * `apps/web` wrote `/icons/name.png` and let the dev server find it. That is the one thing React
 * Native cannot do, so the shared artwork is imported here instead: Metro turns each of these
 * into an asset reference and the PNG exists once. That app was deleted on 20 September 2026
 * (`docs/architecture/adr/ADR-0001.md`); `apps/mobile` is the only consumer now, and the import
 * form is what it needs.
 */
import type { SpendCategory } from '@dhan/contracts'
import { merchantKind } from './merchant-kind.ts'

import logoAmazon from '../logos/amazon.png'
import logoApolloPharmacy from '../logos/apollo-pharmacy.png'
import logoBlinkit from '../logos/blinkit.png'
import logoBookmyshow from '../logos/bookmyshow.png'
import logoBpcl from '../logos/bpcl.png'
import logoCleartrip from '../logos/cleartrip.png'
import logoCroma from '../logos/croma.png'
import logoCrossword from '../logos/crossword.png'
import logoDmart from '../logos/dmart.png'
import logoDominos from '../logos/dominos.png'
import logoFlipkart from '../logos/flipkart.png'
import logoHotstar from '../logos/hotstar.png'
import logoInox from '../logos/inox.png'
import logoJioFiber from '../logos/jio-fiber.png'
import logoLenskart from '../logos/lenskart.png'
import logoLulu from '../logos/lulu.png'
import logoMakemytrip from '../logos/makemytrip.png'
import logoMedplus from '../logos/medplus.png'
import logoMyntra from '../logos/myntra.png'
import logoNetflix from '../logos/netflix.png'
import logoNykaa from '../logos/nykaa.png'
import logoPvr from '../logos/pvr.png'
import logoRapido from '../logos/rapido.png'
import logoReliance from '../logos/reliance.png'
import logoRelianceFresh from '../logos/reliance-fresh.png'
import logoRelianceSmart from '../logos/reliance-smart.png'
import logoSmaaash from '../logos/smaaash.png'
import logoSpencer from '../logos/spencer.png'
import logoSpotify from '../logos/spotify.png'
import logoStarbucks from '../logos/starbucks.png'
import logoSwiggy from '../logos/swiggy.png'
import logoSwiggyDineout from '../logos/swiggy-dineout.png'
import logoSwiggyInstamart from '../logos/swiggy-instamart.png'
import logoThirdWaveCoffee from '../logos/third-wave-coffee.png'
import logoUber from '../logos/uber.png'
import logoZepto from '../logos/zepto.png'
import logoZomato from '../logos/zomato.png'

import kindBeauty from '../icons/merchant/beauty.png'
import kindBikeTaxi from '../icons/merchant/bike-taxi.png'
import kindBiryani from '../icons/merchant/biryani.png'
import kindBooks from '../icons/merchant/books.png'
import kindBroadband from '../icons/merchant/broadband.png'
import kindBurger from '../icons/merchant/burger.png'
import kindChai from '../icons/merchant/chai.png'
import kindCinema from '../icons/merchant/cinema.png'
import kindClinic from '../icons/merchant/clinic.png'
import kindClothing from '../icons/merchant/clothing.png'
import kindCoffee from '../icons/merchant/coffee.png'
import kindElectricity from '../icons/merchant/electricity.png'
import kindElectronics from '../icons/merchant/electronics.png'
import kindEyewear from '../icons/merchant/eyewear.png'
import kindFlight from '../icons/merchant/flight.png'
import kindFuel from '../icons/merchant/fuel.png'
import kindGaming from '../icons/merchant/gaming.png'
import kindGas from '../icons/merchant/gas.png'
import kindGym from '../icons/merchant/gym.png'
import kindInterest from '../icons/merchant/interest.png'
import kindJewellery from '../icons/merchant/jewellery.png'
import kindKirana from '../icons/merchant/kirana.png'
import kindLabTest from '../icons/merchant/lab-test.png'
import kindMetro from '../icons/merchant/metro.png'
import kindMobile from '../icons/merchant/mobile.png'
import kindMusic from '../icons/merchant/music.png'
import kindPerson from '../icons/merchant/person.png'
import kindPharmacy from '../icons/merchant/pharmacy.png'
import kindPizza from '../icons/merchant/pizza.png'
import kindSchool from '../icons/merchant/school.png'
import kindSnacks from '../icons/merchant/snacks.png'
import kindSoftware from '../icons/merchant/software.png'
import kindStreaming from '../icons/merchant/streaming.png'
import kindSupermarket from '../icons/merchant/supermarket.png'
import kindSweets from '../icons/merchant/sweets.png'
import kindThali from '../icons/merchant/thali.png'
import kindTrain from '../icons/merchant/train.png'
import kindWater from '../icons/merchant/water.png'

import udayPortrait from '../avatars/uday.jpg'
import udayRunwayStill from '../avatars/uday-runway.jpg'
import priyaPortrait from '../avatars/priya.png'

import cash from '../icons/spend/cash.png'
import education from '../icons/spend/education.png'
import entertainment from '../icons/spend/entertainment.png'
import feesAndCharges from '../icons/spend/fees-and-charges.png'
import foodAndDining from '../icons/spend/food-and-dining.png'
import groceries from '../icons/spend/groceries.png'
import health from '../icons/spend/health.png'
import income from '../icons/spend/income.png'
import insurance from '../icons/spend/insurance.png'
import investment from '../icons/spend/investment.png'
import loanEmi from '../icons/spend/loan-emi.png'
import rentAndBills from '../icons/spend/rent-and-bills.png'
import shopping from '../icons/spend/shopping.png'
import transfers from '../icons/spend/transfers.png'
import transport from '../icons/spend/transport.png'

/**
 * One illustration per spend category, keyed by the category itself.
 *
 * `Record<SpendCategory, …>` and not a partial map, so adding a sixteenth category to the enum in
 * `@dhan/contracts` fails the build here rather than drawing a blank tile in a statement row.
 */
export type IconRef = string | number

export const SPEND_ICON: Record<SpendCategory, IconRef> = {
  Cash: cash,
  Education: education,
  Entertainment: entertainment,
  'Fees & charges': feesAndCharges,
  'Food & dining': foodAndDining,
  Groceries: groceries,
  Health: health,
  Income: income,
  Insurance: insurance,
  Investment: investment,
  'Loan EMI': loanEmi,
  'Rent & bills': rentAndBills,
  Shopping: shopping,
  Transfers: transfers,
  Transport: transport,
}

/**
 * The advisor's face, for every surface that is not a live call.
 *
 * The tab header, the connecting state and the text tier all show Uday, so the person the
 * customer talks to is the same person whether or not the video connects.
 */
export const UDAY_PORTRAIT: IconRef = udayPortrait
/**
 * Uday at rest, 1088×704: `uday.jpg` cropped to the Runway video's framing (same face size and
 * eye line). It replaced the video's own first frame, which caught him mid-word with his teeth
 * showing; that frame is kept as `uday-runway-mouth-open.jpg`.
 *
 * Shown in the call's frame before the video arrives, framed the same way, so connecting is the
 * picture starting to move rather than one crop of him being swapped for another.
 */
export const UDAY_CALL_STILL: IconRef = udayRunwayStill
/** Its width over its height, which the stage frames by until a real video reports its own. */
export const UDAY_CALL_STILL_ASPECT = 1088 / 704
export const PRIYA_PORTRAIT: IconRef = priyaPortrait

// <generated: assets>
/**
 * Merchant logos, keyed by a slug of the merchant name.
 *
 * Bundled rather than fetched: the app has to render a statement with no network beyond the
 * bank, an IDBI sandbox will not reach a logo CDN, and a row whose icon arrives half a second
 * late looks broken. `tools/fetch-merchant-logos.mjs` refreshes them.
 *
 * `width` is the logo's real pixel width, and it is here because most of these brands publish
 * nothing larger than a favicon. Stretching a 48px mark to fill a 40pt plate is a smear, so the
 * caller renders at native size and lets the plate hold the padding. Anything under 32px is not
 * bundled at all — a drawn icon is the better picture.
 */
const MERCHANT_LOGO: Record<string, { src: IconRef; width: number }> = {
  amazon: { src: logoAmazon, width: 48 },
  'apollo-pharmacy': { src: logoApolloPharmacy, width: 32 },
  blinkit: { src: logoBlinkit, width: 96 },
  bookmyshow: { src: logoBookmyshow, width: 96 },
  bpcl: { src: logoBpcl, width: 48 },
  cleartrip: { src: logoCleartrip, width: 96 },
  croma: { src: logoCroma, width: 96 },
  crossword: { src: logoCrossword, width: 32 },
  dmart: { src: logoDmart, width: 96 },
  dominos: { src: logoDominos, width: 96 },
  flipkart: { src: logoFlipkart, width: 96 },
  hotstar: { src: logoHotstar, width: 64 },
  inox: { src: logoInox, width: 96 },
  'jio-fiber': { src: logoJioFiber, width: 48 },
  lenskart: { src: logoLenskart, width: 96 },
  lulu: { src: logoLulu, width: 96 },
  makemytrip: { src: logoMakemytrip, width: 96 },
  medplus: { src: logoMedplus, width: 96 },
  myntra: { src: logoMyntra, width: 96 },
  netflix: { src: logoNetflix, width: 64 },
  nykaa: { src: logoNykaa, width: 96 },
  pvr: { src: logoPvr, width: 96 },
  rapido: { src: logoRapido, width: 96 },
  reliance: { src: logoReliance, width: 96 },
  'reliance-fresh': { src: logoRelianceFresh, width: 96 },
  'reliance-smart': { src: logoRelianceSmart, width: 96 },
  smaaash: { src: logoSmaaash, width: 96 },
  spencer: { src: logoSpencer, width: 96 },
  spotify: { src: logoSpotify, width: 48 },
  starbucks: { src: logoStarbucks, width: 96 },
  swiggy: { src: logoSwiggy, width: 96 },
  'swiggy-dineout': { src: logoSwiggyDineout, width: 96 },
  'swiggy-instamart': { src: logoSwiggyInstamart, width: 96 },
  'third-wave-coffee': { src: logoThirdWaveCoffee, width: 96 },
  uber: { src: logoUber, width: 96 },
  zepto: { src: logoZepto, width: 96 },
  zomato: { src: logoZomato, width: 96 },
}

/**
 * One drawing per kind of merchant, from `tools/gen-merchant-icons.mjs`.
 *
 * These sit between the brand logo and the spend-category illustration. The category says
 * "Food & dining", which is equally true of a pizza order, a chai stall and a biryani house —
 * drawing all three the same way is how a statement stops being read.
 */
const MERCHANT_KIND_ICON: Record<string, IconRef> = {
  beauty: kindBeauty,
  'bike-taxi': kindBikeTaxi,
  biryani: kindBiryani,
  books: kindBooks,
  broadband: kindBroadband,
  burger: kindBurger,
  chai: kindChai,
  cinema: kindCinema,
  clinic: kindClinic,
  clothing: kindClothing,
  coffee: kindCoffee,
  electricity: kindElectricity,
  electronics: kindElectronics,
  eyewear: kindEyewear,
  flight: kindFlight,
  fuel: kindFuel,
  gaming: kindGaming,
  gas: kindGas,
  gym: kindGym,
  interest: kindInterest,
  jewellery: kindJewellery,
  kirana: kindKirana,
  'lab-test': kindLabTest,
  metro: kindMetro,
  mobile: kindMobile,
  music: kindMusic,
  person: kindPerson,
  pharmacy: kindPharmacy,
  pizza: kindPizza,
  school: kindSchool,
  snacks: kindSnacks,
  software: kindSoftware,
  streaming: kindStreaming,
  supermarket: kindSupermarket,
  sweets: kindSweets,
  thali: kindThali,
  train: kindTrain,
  water: kindWater,
}

export const logoSlug = (merchant: string): string =>
  merchant
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** The brand's logo and its true pixel width, or undefined where this merchant has none. */
export function merchantLogo(
  merchant: string | null | undefined,
): { src: IconRef; width: number } | undefined {
  if (!merchant) return undefined
  const slug = logoSlug(merchant)
  if (MERCHANT_LOGO[slug]) return MERCHANT_LOGO[slug]
  // "Swiggy Instamart" has its own logo; "Reliance Digital Mumbai" should still find Reliance.
  const prefix = Object.keys(MERCHANT_LOGO)
    .filter((key) => slug.startsWith(`${key}-`))
    .sort((a, b) => b.length - a.length)[0]
  return prefix ? MERCHANT_LOGO[prefix] : undefined
}

/** The drawing for what this merchant is, or undefined when nothing recognises it. */
export function merchantKindIcon(merchant: string | null | undefined): IconRef | undefined {
  const kind = merchantKind(merchant)
  return kind ? MERCHANT_KIND_ICON[kind] : undefined
}
// </generated: assets>
