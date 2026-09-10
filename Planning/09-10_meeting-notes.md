# 9/10 Meeting Notes

Drew and Tyler met to discuss goals for the project. See notes and action items below.

## Features

*Ordered by priority.*

### p0

- UI that allows each person to update their picks between weeks 6 and 7 and choose their champ
- Don't allow user to submit their picks unless they have:
  - Only made three **valid** moves
  - Have chosen a champion
- Allows each user to sign in
- Picks would lock before first game of wk 7
- Users sign in to update picks, maybe they get an email or text to authenticate
- "Admin mode" for Tyler and Drew, allows us to overwrite picks admin updates and wipe teams between years
- Deployed somewhere everyone can access it

### p1

- Show live leaderboard
- See everyone's picks
	- Or maybe just stats instead? e.g., what team's been picked the most, least, etc.

### p2 

- Track "sleeper" teams--any picks that might give them an outsized advantage

### p3

- Create interface for users to submit new picks before wk 1
  - *Could we refactor wk 6-7 UI to work for both?*
- **Confirm w/ Ty:** 
  - Show winner at end of year?
  - Email/text results out to everyone?

### Nice to Haves

- Allow users to search for a team when picking them
  - Include aliases for teams in search (e.g., "Penn State University" can be searched as "PSU")
- Make the thing look cool
  - Maybe some sort of 8-bit theme (think Tecmo Super Bowl)

## Notes

Ty's GitHub: tylerfarr5

### Point Structure

- 1 for right team
- 1 for right position
- 3 for correct champion
  - Not applied until championship

### Questions
- Do we want users to see each others' submissions?
	- After week 1

## Action Items

### Drew

- Create a design document which:
  - Identifies work necessary to implement features
  - Estimates time required for each feature
  - Recommends which features get addressed before wk 6 based on the above
  - Contains mocks of UI-heavy features (new components)
  - Notes questions to discuss with Tyler
- Create low-fi mocks of the site to confirm with Ty
- Set up next meeting with Ty when above items are done

### Tyler

- Find a way to easily determine a team's conference and whether they're P4 vs. G6
  - He mentioned a CSV during call
- Create an algorithm for identifying a sleeper pick from a team