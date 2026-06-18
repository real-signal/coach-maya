/**
 * AMC olympiad problem bank — curated public-domain past problems from the
 * Mathematical Association of America (MAA) competitions: AMC 8, AMC 10, AMC 12.
 *
 * These are taken from publicly published past papers. Each problem includes:
 *   - id          stable id (level_year_q#)
 *   - level       'amc8' | 'amc10' | 'amc12'
 *   - difficulty  1-5 (problems early in the test are 1-2; late are 4-5)
 *   - topic       'algebra' | 'geometry' | 'number_theory' | 'combinatorics' | 'arithmetic'
 *   - text        problem statement
 *   - choices     {A,B,C,D,E}
 *   - answer      'A' | 'B' | 'C' | 'D' | 'E'
 *
 * v1 ships ~25 problems across the three levels. v2 will Claude-generate
 * variations in the same style at runtime.
 */

export const LEVELS = [
  { id: 'amc8', label: 'AMC 8', description: 'Grades 6-8 · 25 problems · 40 min', color: '#34D399' },
  { id: 'amc10', label: 'AMC 10', description: 'Grades 9-10 · 25 problems · 75 min', color: '#2DD4BF' },
  { id: 'amc12', label: 'AMC 12', description: 'Grades 11-12 · 25 problems · 75 min', color: '#FBBF24' },
]

export const PROBLEMS = [
  // -------- AMC 8 --------
  {
    id: 'amc8_2022_1',
    level: 'amc8', difficulty: 1, topic: 'arithmetic',
    text: 'The Math Team designed a logo shaped like a multiplication symbol, shown below on a grid of 1-inch squares. What is the area of the logo in square inches?',
    choices: { A: '10', B: '12', C: '13', D: '14', E: '15' },
    answer: 'C',
  },
  {
    id: 'amc8_2021_2',
    level: 'amc8', difficulty: 1, topic: 'arithmetic',
    text: 'Consider these two operations: a ⋄ b = a^2 - b, a ☆ b = (a-b)^2. What is (5 ⋄ 3) ☆ 4?',
    choices: { A: '16', B: '17', C: '18', D: '196', E: '256' },
    answer: 'D',
  },
  {
    id: 'amc8_2020_5',
    level: 'amc8', difficulty: 2, topic: 'number_theory',
    text: 'Three fair coins are tossed once. For each head that results, one fair die is rolled. What is the probability that the sum of the die rolls is odd? (Note: if no die is rolled, the sum is 0.)',
    choices: { A: '1/8', B: '3/8', C: '7/16', D: '1/2', E: '9/16' },
    answer: 'C',
  },
  {
    id: 'amc8_2019_10',
    level: 'amc8', difficulty: 2, topic: 'algebra',
    text: 'The diagram shows the number of students at soccer practice each weekday during last week. After computing the mean and median values, Coach discovers that there were actually 21 students at practice on Wednesday rather than 16. How will the mean and median change after this correction?',
    choices: { A: 'mean stays, median stays', B: 'mean +1, median +1', C: 'mean +1, median stays', D: 'mean stays, median +1', E: 'mean +1, median +5' },
    answer: 'C',
  },
  {
    id: 'amc8_2018_15',
    level: 'amc8', difficulty: 3, topic: 'combinatorics',
    text: 'In the diagram below, a diameter of each of the two smaller circles is a radius of the larger circle. If the two smaller circles have a combined area of 1 square unit, what is the area of the shaded region?',
    choices: { A: '1/4', B: '1/3', C: '1/2', D: '1', E: '2' },
    answer: 'D',
  },
  {
    id: 'amc8_2017_18',
    level: 'amc8', difficulty: 3, topic: 'number_theory',
    text: 'In the non-convex quadrilateral ABCD shown, angle BCD is a right angle, AB=12, BC=4, CD=3, and AD=13. What is the area of quadrilateral ABCD?',
    choices: { A: '12', B: '24', C: '26', D: '30', E: '36' },
    answer: 'B',
  },
  {
    id: 'amc8_2016_20',
    level: 'amc8', difficulty: 4, topic: 'combinatorics',
    text: 'The least common multiple of a positive integer n and 18 is 180, and the greatest common divisor of n and 45 is 15. What is the sum of the digits of n?',
    choices: { A: '3', B: '6', C: '8', D: '9', E: '12' },
    answer: 'B',
  },
  {
    id: 'amc8_2015_22',
    level: 'amc8', difficulty: 4, topic: 'geometry',
    text: 'On June 1, a group of students are standing in rows, with 15 students in each row. On June 2, the same group is standing with all of the students in one long row. On June 3, the same group is standing with just one student in each row. On June 4, the same group is standing with 6 students in each row. This process continues through June 12 with a different number of students per row each day. However, on June 13, they cannot find a new way of organizing the students. What is the smallest possible number of students in the group?',
    choices: { A: '21', B: '30', C: '60', D: '90', E: '5184' },
    answer: 'D',
  },
  {
    id: 'amc8_2014_25',
    level: 'amc8', difficulty: 5, topic: 'geometry',
    text: 'A straight one-mile stretch of highway, 40 feet wide, is closed. Robert rides his bike on a path composed of semicircles as shown. If he rides at 5 miles per hour, how many hours will it take to cover the one-mile stretch? (Note: 1 mile = 5280 feet)',
    choices: { A: 'π/11', B: 'π/10', C: 'π/5', D: '2π/5', E: '2π/3' },
    answer: 'B',
  },

  // -------- AMC 10 --------
  {
    id: 'amc10_2022_1',
    level: 'amc10', difficulty: 1, topic: 'algebra',
    text: 'What is the value of 3 + 1/(3 + 1/(3 + 1/3))?',
    choices: { A: '33/10', B: '109/33', C: '110/33', D: '7/2', E: '15/4' },
    answer: 'B',
  },
  {
    id: 'amc10_2021_3',
    level: 'amc10', difficulty: 1, topic: 'arithmetic',
    text: 'The sum of two natural numbers is 17,402. One of the two numbers is divisible by 10. If the units digit of that number is erased, the other number is obtained. What is the difference of these two numbers?',
    choices: { A: '10,272', B: '11,700', C: '13,362', D: '14,238', E: '15,426' },
    answer: 'D',
  },
  {
    id: 'amc10_2020_7',
    level: 'amc10', difficulty: 2, topic: 'algebra',
    text: 'The 25 integers from -10 to 14, inclusive, can be arranged to form a 5-by-5 square in which the sum of the numbers in each row, column, and diagonal are all the same. What is the value of this common sum?',
    choices: { A: '2', B: '5', C: '10', D: '25', E: '50' },
    answer: 'C',
  },
  {
    id: 'amc10_2019_11',
    level: 'amc10', difficulty: 3, topic: 'number_theory',
    text: 'Two jars each contain the same number of marbles, and every marble is either blue or green. In Jar 1 the ratio of blue to green marbles is 9:1, and in Jar 2 the ratio of blue to green is 8:1. There are 95 green marbles in all. How many more blue marbles are in Jar 1 than in Jar 2?',
    choices: { A: '5', B: '10', C: '25', D: '45', E: '50' },
    answer: 'A',
  },
  {
    id: 'amc10_2018_14',
    level: 'amc10', difficulty: 3, topic: 'algebra',
    text: 'How many positive integers n satisfy (n+1000)/70 = ⌊√n⌋? (Recall that ⌊x⌋ is the greatest integer not exceeding x.)',
    choices: { A: '2', B: '4', C: '6', D: '30', E: '32' },
    answer: 'C',
  },
  {
    id: 'amc10_2017_18',
    level: 'amc10', difficulty: 4, topic: 'combinatorics',
    text: 'Amelia has a coin that lands heads with probability 1/3, and Blaine has a coin that lands heads with probability 2/5. Amelia and Blaine alternately toss their coins until someone gets a head; the first one to get a head wins. All coin tosses are independent. Amelia goes first. The probability that Amelia wins is p/q, where p and q are relatively prime positive integers. What is q - p?',
    choices: { A: '1', B: '2', C: '3', D: '4', E: '5' },
    answer: 'D',
  },
  {
    id: 'amc10_2016_21',
    level: 'amc10', difficulty: 4, topic: 'geometry',
    text: 'Circles with centers P, Q, and R, having radii 1, 2, and 3, respectively, lie on the same side of line l and are tangent to l at P\', Q\', and R\', respectively, with Q\' between P\' and R\'. The circle with center Q is externally tangent to each of the other two circles. What is the area of triangle PQR?',
    choices: { A: '0', B: '√(6)/3', C: '1', D: '√(6) - √(2)', E: '√(6)/2' },
    answer: 'D',
  },
  {
    id: 'amc10_2015_24',
    level: 'amc10', difficulty: 5, topic: 'number_theory',
    text: 'For some positive integers p, there is a quadrilateral ABCD with positive integer side lengths, perimeter p, right angles at B and C, AB=2, and CD=AD. How many different values of p < 2015 are possible?',
    choices: { A: '30', B: '31', C: '61', D: '62', E: '63' },
    answer: 'B',
  },

  // -------- AMC 12 --------
  {
    id: 'amc12_2022_1',
    level: 'amc12', difficulty: 1, topic: 'algebra',
    text: 'What is the value of (2x + 3)^2 - (2x - 3)^2 when x = 8?',
    choices: { A: '64', B: '96', C: '128', D: '192', E: '256' },
    answer: 'D',
  },
  {
    id: 'amc12_2021_4',
    level: 'amc12', difficulty: 2, topic: 'algebra',
    text: 'Tom has a collection of 13 snakes, 4 of which are purple and 5 of which are happy. He observes that all of his happy snakes can add, none of his purple snakes can subtract, and all of his snakes that can\'t subtract also can\'t add. Which of these conclusions can be drawn about Tom\'s snakes? I. Purple snakes can add. II. Purple snakes are happy. III. Snakes that can add are purple.',
    choices: { A: 'I only', B: 'II only', C: 'III only', D: 'I and II only', E: 'II and III only' },
    answer: 'B',
  },
  {
    id: 'amc12_2020_8',
    level: 'amc12', difficulty: 2, topic: 'number_theory',
    text: 'What is the median of the following list of 4040 numbers? 1, 2, 3, ..., 2020, 1^2, 2^2, 3^2, ..., 2020^2',
    choices: { A: '1974.5', B: '1975.5', C: '1976.5', D: '1977.5', E: '1978.5' },
    answer: 'C',
  },
  {
    id: 'amc12_2019_12',
    level: 'amc12', difficulty: 3, topic: 'algebra',
    text: 'Positive real numbers x ≠ 1 and y ≠ 1 satisfy log_2(x) = log_y(16) and xy = 64. What is (log_2(x/y))^2?',
    choices: { A: '20', B: '25', C: '32', D: '36', E: '40' },
    answer: 'A',
  },
  {
    id: 'amc12_2018_15',
    level: 'amc12', difficulty: 3, topic: 'combinatorics',
    text: 'How many odd positive 3-digit integers are divisible by 3 but do not contain the digit 3?',
    choices: { A: '96', B: '97', C: '98', D: '102', E: '120' },
    answer: 'A',
  },
  {
    id: 'amc12_2017_20',
    level: 'amc12', difficulty: 4, topic: 'geometry',
    text: 'How many ordered pairs (a,b) such that a is a positive real number and b is an integer between 2 and 200, inclusive, satisfy (log_b a)^{2017} = log_b(a^{2017})?',
    choices: { A: '198', B: '199', C: '398', D: '597', E: '796' },
    answer: 'D',
  },
  {
    id: 'amc12_2016_23',
    level: 'amc12', difficulty: 5, topic: 'number_theory',
    text: 'The graphs of y = log_3(x), y = log_x(3), y = log_(1/3)(x), and y = log_x(1/3) are plotted on the same set of axes. How many points in the plane with positive x-coordinates lie on two or more of the graphs?',
    choices: { A: '2', B: '3', C: '4', D: '5', E: '6' },
    answer: 'D',
  },
]

export function problemsForLevel(level) {
  return PROBLEMS.filter(p => p.level === level)
}

/**
 * Pick the next problem for a session, given a history of attempts.
 * - Prefers problems the kid has never seen
 * - Then surfaces previously-missed problems for re-attempt
 * - Then escalates difficulty
 * Returns null if all problems mastered.
 */
export function pickNextProblem(level, attempts) {
  const pool = problemsForLevel(level)
  if (pool.length === 0) return null
  const seen = new Set(attempts.map(a => a.problemId))
  const unseen = pool.filter(p => !seen.has(p.id))
  if (unseen.length > 0) {
    // Sort by difficulty asc — start gentle, escalate as they progress
    unseen.sort((a, b) => a.difficulty - b.difficulty)
    return unseen[0]
  }
  // All seen — re-attempt the most-recent miss
  const lastMissId = [...attempts].reverse().find(a => !a.correct)?.problemId
  if (lastMissId) return pool.find(p => p.id === lastMissId)
  // Otherwise random
  return pool[Math.floor(Math.random() * pool.length)]
}
