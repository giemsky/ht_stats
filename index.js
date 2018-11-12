require('dotenv').config()

const puppeteer = require('puppeteer');
const util = require('util')

const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const userSelector = "#ctl00_CPContent_ucLogin_txtUserName";
const passwordSelector = "#ctl00_CPContent_ucLogin_txtPassword";
const loginBtnSelector = "#ctl00_CPContent_ucLogin_butLogin";

const pathWildcard = "/World/Series/Stats.aspx?LeagueLevelUnitID=";
const startLeagueId = 32114;
const endLeagueID = 33137;

var debug = require('debug')('harvester');
var leagues = [];

var League = function(leagueId, name, teams) {
  this.leagueId = leagueId;
  this.name = name;
  this.teams = teams;
};

var Team = function(name, stats) {
  this.name = name;
  this.stats = stats;
};

var formatUrl = function(hostname, leagueId) {
  return `https://${hostname}${pathWildcard + leagueId}`;
};

var parseLeague = async function(leagueId, page) {
  var teams = [];
  var league;

  var leagueTable = await page.evaluate(() => {
    let league = {};
    league.teams = [];
    league.name = document.querySelector("#ctl00_ctl00_CPContent_divStartMain > div.boxHead > h2 > span:nth-child(2) > a").textContent;

    let rows = document.querySelectorAll("#mainBody > div:nth-child(4) > table tbody tr");
    rows.forEach((row) => {
      var cols            = row.querySelectorAll("td");
      var teamName        = cols[1].textContent;
      var totalScore      = cols[2].textContent;
      var defenseScore    = cols[3].textContent;
      var playmakingScore = cols[4].textContent;
      var attackScore     = cols[5].textContent;
      league.teams.push([teamName, totalScore, defenseScore, playmakingScore, attackScore]);
    })
    return Promise.resolve(league);
  });

  leagueTable.teams.forEach((team) => {
    teams.push(new Team(team[0], team.slice(1)));
  });
  league = new League(leagueId, leagueTable.name, teams)
  leagues.push(league);
};

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('https://hattrick.org');

  await page.click(userSelector);
  await page.keyboard.type(process.env.HT_USER);

  await page.click(passwordSelector);
  await page.keyboard.type(process.env.HT_PASSWORD);

  await page.click(loginBtnSelector);
  await page.waitForNavigation({ waitUntil: 'networkidle0' });
  
  var currentLeagueId = startLeagueId;
  var currentUrl;
  var hostname = page.url().match(/www.*hattrick.org/)[0]

  debug(`Using server ${hostname}`);

  while( currentLeagueId <= endLeagueID ) {
    currentUrl = formatUrl(hostname, currentLeagueId);
    await page.goto(currentUrl);
    await parseLeague(currentLeagueId, page);
    debug(`Visited ${currentUrl}`);
    currentLeagueId++;
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  debug(util.inspect(leagues, false, null, true));
  
  await browser.close();

  const csvWriter = createCsvWriter({
      path: 'teams.csv',
      header: [
          {id: 'league', title: 'League'},
          {id: 'team', title: 'Team'},
          {id: 'total', title: 'Total'}
      ]
  });
   
  var csvRecords = [];

  leagues.forEach((league) => {
    league.teams.forEach((team) => {
      csvRecords.push({
        league: league.name,
        team: team.name,
        total: team.stats[0]
      });
    });
  });
  
  csvWriter.writeRecords(csvRecords);
})();