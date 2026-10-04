// The member help centre: each article exists in English and in French. setup.ts adds 200,000 generated archive
// articles around these so the timings mean something.
export type Article = { slug: string; title_en: string; body_en: string; title_fr: string; body_fr: string };

export const ARTICLES: Article[] = [
  {
    slug: "early-retirement",
    title_en: "Early retirement: when can I stop working?",
    body_en: "You can take your pension from age 55 if your scheme rules allow it. Taking it early reduces each payment, because it is paid for longer. Book a call with Élodie Durand, our pensions adviser, before you decide.",
    title_fr: "Retraite anticipée : quand puis-je arrêter de travailler ?",
    body_fr: "Vous pouvez demander votre retraite à partir de 55 ans si le règlement de votre régime le permet. Une retraite anticipée réduit chaque versement, puisqu'il est servi plus longtemps. Prenez rendez-vous avec Élodie Durand, notre conseillère retraite, avant de décider.",
  },
  {
    slug: "beneficiary",
    title_en: "Naming a beneficiary",
    body_en: "Tell us who should receive your savings if you die before retirement. You can name several beneficiaries and split the amount between them. Update the list after a marriage, a divorce or a birth.",
    title_fr: "Désigner un bénéficiaire",
    body_fr: "Indiquez-nous qui doit recevoir votre épargne si vous décédez avant la retraite. Vous pouvez désigner plusieurs bénéficiaires et répartir le montant entre eux. Mettez la liste à jour après un mariage, un divorce ou une naissance.",
  },
  {
    slug: "transfer-out",
    title_en: "Transferring your pension to another scheme",
    body_en: "A transfer moves your savings to another provider. Check the fees and the guarantees you would lose first. Élodie and the advice team can compare the two schemes with you.",
    title_fr: "Transférer votre épargne vers un autre régime",
    body_fr: "Un transfert déplace votre épargne chez un autre organisme. Vérifiez d'abord les frais et les garanties que vous perdriez. Élodie et l'équipe conseil peuvent comparer les deux régimes avec vous.",
  },
  {
    slug: "annual-statement",
    title_en: "Your annual statement explained",
    body_en: "Each spring we send a statement with your contributions, your employer's contributions, the growth of your savings and a projection at retirement age.",
    title_fr: "Comprendre votre relevé annuel",
    body_fr: "Chaque printemps, nous envoyons un relevé avec vos cotisations, celles de votre employeur, l'évolution de votre épargne et une projection à l'âge de la retraite.",
  },
  {
    slug: "adviser",
    title_en: "Meet Élodie, your pensions adviser",
    body_en: "Élodie Durand answers members' questions by phone and video call, in English and in French. She can explain your options but cannot choose for you.",
    title_fr: "Élodie, votre conseillère retraite",
    body_fr: "Élodie Durand répond aux questions des adhérents par téléphone et en visioconférence, en français et en anglais. Elle explique vos options mais ne peut pas choisir à votre place.",
  },
  {
    slug: "change-details",
    title_en: "Changing your address or bank details",
    body_en: "Update your address and bank account in the portal. A change of bank details is confirmed by a letter to your old address, to protect you from fraud.",
    title_fr: "Modifier votre adresse ou vos coordonnées bancaires",
    body_fr: "Mettez à jour votre adresse et votre compte bancaire dans le portail. Un changement de coordonnées bancaires est confirmé par un courrier à votre ancienne adresse, pour vous protéger de la fraude.",
  },
  {
    slug: "tax-relief",
    title_en: "Tax relief on contributions",
    body_en: "Your contributions are taken before income tax, up to an annual allowance. Contributions above the allowance are taxed.",
    title_fr: "Fiscalité des cotisations",
    body_fr: "Vos cotisations sont déduites avant l'impôt sur le revenu, dans la limite d'un plafond annuel. Les cotisations au-delà du plafond sont imposées.",
  },
  {
    slug: "change-employer",
    title_en: "What happens when I change employer?",
    body_en: "Your savings stay invested. Your new employer may join the same scheme; otherwise you can leave the savings where they are or ask for a transfer.",
    title_fr: "Que se passe-t-il si je change d'employeur ?",
    body_fr: "Votre épargne reste investie. Votre nouvel employeur peut adhérer au même régime ; sinon vous pouvez laisser l'épargne en place ou demander un transfert.",
  },
  {
    slug: "voluntary",
    title_en: "Paying voluntary contributions",
    body_en: "You can add to your savings with one-off or monthly voluntary contributions, on top of what you and your employer pay.",
    title_fr: "Effectuer des versements volontaires",
    body_fr: "Vous pouvez compléter votre épargne par des versements volontaires ponctuels ou mensuels, en plus des cotisations versées par vous et votre employeur.",
  },
  {
    slug: "ill-health",
    title_en: "Ill-health retirement",
    body_en: "If illness stops you working, you may take your pension early without the usual reduction. A medical report is required.",
    title_fr: "Retraite pour invalidité",
    body_fr: "Si une maladie vous empêche de travailler, vous pouvez partir à la retraite plus tôt sans la réduction habituelle. Un rapport médical est nécessaire.",
  },
];

// The employers a member may type: the three the portal serves, and a few with accents and long names.
export const EMPLOYERS = ["Acme", "Globex Corporation", "Initech", "Boulangerie Élodie", "Garage Lefèvre & Fils", "Crèche Les Petits Câlins", "Hôtel Bérénice SAS", "Clinique Saint-Éloi"];
