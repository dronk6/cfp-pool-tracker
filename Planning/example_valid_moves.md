# Examples of Valid Moves

Each of the following moves counts as **ONE** of a user's three moves. Moves are always counted against the user's *initial* picks. The full counting rule is in the [design document](./design-document.md#how-moves-are-counted).

**Not counted as moves:** any change to the First Three Out (13-15) and choosing a champion. The only constraints there are that the First Three Out contains 3 distinct teams, none of whom are in the top 12, and that the champion is in the top 12.

## Rearrange Top 12

Change the order of the teams. Do not alter the contents of the list. However many teams change position (here, four), this is **one** move in total.

### Before 

1. Ohio State
2. Notre Dame
3. Georgia
4. Oregon
5. Texas
6. Indiana
7. Miami
8. Texas Tech
9. Oklahoma
10. LSU
11. Ole Miss
12. Memphis

### After

1. Ohio State
2. Memphis
3. Texas
4. Oregon
5. Georgia
6. Indiana
7. Miami
8. Texas Tech
9. Oklahoma
10. LSU
11. Ole Miss
12. Notre Dame

## Replace a Team

Remove a team in the top 12 and insert a new team in its exact place.

### Before 

1. Ohio State
2. Notre Dame
3. Georgia
4. Oregon
5. Texas
6. Indiana
7. Miami
8. Texas Tech
9. Oklahoma
10. LSU
11. Ole Miss
12. Memphis

### After

1. Penn State
2. Notre Dame
3. Georgia
4. Oregon
5. Texas
6. Indiana
7. Miami
8. Texas Tech
9. Oklahoma
10. LSU
11. Ole Miss
12. Memphis

## Combined Examples

Starting from the "Before" list above:

- Replace Memphis with Penn State in slot 12 **and** swap Notre Dame with Texas: **2 moves** (1 replacement + 1 reorder).
- Replace Memphis with Penn State but put Penn State in slot 1 (shifting everyone down): **2 moves** (1 replacement + 1 reorder, since retained teams changed slots).
- Replace three different teams in their exact slots: **3 moves**.
- Replace three teams in their exact slots **and** reorder anyone: **4 moves, invalid**.
- Drop Memphis to the First Three Out, move a First Three Out team into slot 12: **1 move** (the replacement; the First Three Out edit is free).
- Reorder the First Three Out only: **0 moves**.
