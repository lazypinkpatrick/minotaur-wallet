import "@testing-library/jest-dom/extend-expect";
import axios, { AxiosPromise } from "axios";
import * as syncFunctions from './sync';
import {stepForward, createBlockArrayByID} from './sync';
import {Block} from './Types'
import * as fs from "fs"

const db = fs.readFileSync(`${__dirname}/db.json`).toString();
const dbJson : Block[] = JSON.parse(db);

jest.mock('axios');

/**
 * testing stepforward function to insert given blocks correctly in local db.
 * Dependancy: axois mocked.
 * Scenario: Create a sample response and make mocked axios instance return it, then call stepForward function.
 * Expected: insertToDB function must be called once with determined block.
 */
test('insert blocks to database',async() => {
    const spyInsertToDB = jest.spyOn(syncFunctions, 'insertToDB')
    const block : Block = {
        id : '504',
        height : 3
    };
    const lastLoadedBlock : Block = dbJson[dbJson.length-1];
    (axios.get as jest.Mock).mockReset();
    (axios.get as jest.Mock).mockResolvedValueOnce(block);
    const result = await stepForward(lastLoadedBlock, "Testnet");
    expect(spyInsertToDB).toHaveBeenCalledWith([block]);
})

/**
 * testing createBlockArrayByID function to build an array of blocks with given IDs and correct heights.
 * Dependancy: -
 * Scenario: Create a sample array of 2 ID-strings and assume the current height is 0.
 * Expected: createBlockArrayByID function must return array of two blocks with given IDs and heights 1 and 2 respectively.
 */
test('create array of blocks with given IDs', () => {
    const IDs : string[] = ["123" , "190"]
    const expectedBlocks : Block[] = [
        {
            id : IDs[0],
            height : 1
        },
        {
            id : IDs[1],
            height : 2
        }
    ]
    expect(createBlockArrayByID(IDs, 0)).toStrictEqual(expectedBlocks);
})

/**
 * testing syncFunction to call removeFromDB function in case of fork and remove forked blocks from db.
 * Dependancy: -
 * Scenario: checkFork function returns true => fork happened. 
 *           stepBackward function returns the receivedBlock as the fork point.
 *           then removeFromDB is called and remove forked blocks from db.
 * Expected: blocks with height greater than receivedBlock have to be removed.
 */
test('remove blocks from database', async() => {
    const spyCalcFork= jest.spyOn(syncFunctions,'calcFork');
    const spyRemovefromDB = jest.spyOn(syncFunctions,'removeFromDB');
    const spyCheckFork = jest.spyOn(syncFunctions,'checkFork');
    const network_type = "Testnet"
    
    const lastLoadedBlock : Block = dbJson[dbJson.length-1];
    const forkPoint: number = dbJson[1].height
    
    spyCheckFork.mockReturnValueOnce(Promise.resolve(true));
    spyCalcFork.mockReturnValueOnce(Promise.resolve(forkPoint));
    syncFunctions.syncBlocks(lastLoadedBlock, network_type);
    expect(spyRemovefromDB).toHaveBeenCalledWith(forkPoint, network_type);
})

/**
 * testing checkFork to detect fork in specified height.
 * Dependancy: axois mocked.
 * Scenario: axios response contains the block which is exactly the same as last loaded block from database.
 * Expected: return false(fork is not happened.)
 */
test('check fork function in normal situation', async() => {
    const lastLoadedBlock : Block = dbJson[dbJson.length-1]; 
    const receivedBlock : Block = lastLoadedBlock;
    (axios.get as jest.Mock).mockReset();
    (axios.get as jest.Mock).mockResolvedValueOnce(receivedBlock);
    expect(syncFunctions.checkFork(lastLoadedBlock, "Testnet")).toStrictEqual(false);
})

/**
 * testing checkFork to detect fork in specified height.
 * Dependancy: axois mocked.
 * Scenario: axios response contains the block which has different id from the last loaded block from database.
 * Expected: return true(fork is happened.)
 */
 test('check fork function in case of fork', async() => {
    const lastLoadedBlock : Block = dbJson[dbJson.length-1]; 
    const receivedBlock : Block = {
        id: lastLoadedBlock.id.concat('1'),
        height: lastLoadedBlock.height
    };
    (axios.get as jest.Mock).mockReset();
    (axios.get as jest.Mock).mockResolvedValueOnce(receivedBlock);
    expect(syncFunctions.checkFork(lastLoadedBlock, "Testnet")).toStrictEqual(true);
})

/**
 * testing calcFork to find fork point correctly.
 * Dependancy: axois mocked.
 * Scenario: axios reponse set to fork last 2 blocks and return third block correctly.
 * Expected: return len(db) - 3 as fork point's height.
 */
test('calc fork point function', async() => {
    const lastLoadedBlock : Block = dbJson[dbJson.length-1]; 
    const len = dbJson.length;
    const receivedBlocks : Block[] = dbJson.slice(-2).map((block) => {
        return {...block, id : block.id.concat('1')}
    });
    (axios.get as jest.Mock).mockReset();
    (axios.get as jest.Mock).mockResolvedValueOnce(receivedBlocks[1]);
    (axios.get as jest.Mock).mockResolvedValueOnce(receivedBlocks[0]);
    (axios.get as jest.Mock).mockResolvedValueOnce(dbJson[len - 3]);
    expect(syncFunctions.calcFork(lastLoadedBlock, "Testnet")).toStrictEqual(dbJson[len - 3].height);
})