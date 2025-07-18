# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

## Word Gift Claiming Flow

Administrators can gift unclaimed words to players. Gifts are stored in the
`WordGifts` collection and include the recipient's user ID. When a player visits
`/claim-word/[giftId]` they are shown a confirmation screen. Accepting the gift
triggers a server action that assigns the word to the intended recipient and
marks the gift as claimed. Declining simply expires the gift, leaving the word
unowned. This process works even if the recipient is not logged in.
