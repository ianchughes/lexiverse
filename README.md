# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

## Word Gift Claiming Flow

Administrators can gift unclaimed words to players. Gifts are stored in the
`WordGifts` collection and include the recipient's user ID. When a player visits
`/claim-word/[giftId]` the app calls a server action that performs a Firestore
transaction to assign the word and mark the gift as claimed. Firestore security
rules allow only the recipient to read the gift and update its `status` and
`claimedAt` fields during this process.
