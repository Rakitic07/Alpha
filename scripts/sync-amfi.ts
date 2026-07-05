/**
 * Script to sync AMFI market cap classification data
 * 
 * Usage:
 *   npx tsx scripts/sync-amfi.ts                    # Sync current period
 *   npx tsx scripts/sync-amfi.ts 2024 H2            # Sync specific period
 *   npx tsx scripts/sync-amfi.ts --status           # Check current status
 *   npx tsx scripts/sync-amfi.ts --file path.xlsx   # Sync from local file
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { prisma } from './lib/db';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

type AMFICategory = 'Large' | 'Mid' | 'Small' | 'Micro';

interface AMFIStockClassification {
    rank: number;
    companyName: string;
    symbol: string;
    isin: string;
    category: AMFICategory;
    avgMarketCap: number;
}

interface AMFIPeriod {
    year: number;
    halfYear: 'H1' | 'H2';
}

const AMFI_BASE_URL = 'https://www.amfiindia.com/Themes/Theme1/downloads/';

function getAMFIDownloadUrl(period: AMFIPeriod): string {
    const { year, halfYear } = period;
    const month = halfYear === 'H1' ? 'Jun' : 'Dec';
    const day = halfYear === 'H1' ? '30' : '31';
    
    return `${AMFI_BASE_URL}AverageMarketCapitalizationoflistedcompaniesduringthesixmonthsended${day}${month}${year}.xlsx`;
}

function getCurrentAMFIPeriod(date: Date = new Date()): AMFIPeriod {
    const year = date.getFullYear();
    const month = date.getMonth();
    
    if (month < 6) {
        return { year: year - 1, halfYear: 'H2' };
    } else {
        return { year, halfYear: 'H1' };
    }
}

function getCategoryFromRank(rank: number): AMFICategory {
    if (rank <= 100) return 'Large';
    if (rank <= 250) return 'Mid';
    if (rank <= 500) return 'Small';
    return 'Micro';
}

async function parseAMFIExcel(buffer: ArrayBuffer): Promise<AMFIStockClassification[]> {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { 
        header: 1,
        defval: '',
        raw: false 
    });
    
    if (rawRows.length < 3) {
        console.error('Excel file too short');
        return [];
    }

    // Skip title row (row 0), headers are in row 1
    const headerRow = rawRows[1] as string[];
    const dataRows = rawRows.slice(2);

    // Build column index map
    const colIndex = new Map<string, number>();
    headerRow.forEach((header, idx) => {
        if (header) colIndex.set(String(header).trim(), idx);
    });

    const getCell = (row: unknown[], ...headers: string[]): string => {
        for (const h of headers) {
            const idx = colIndex.get(h);
            if (idx !== undefined && row[idx] != null) {
                return String(row[idx]).trim();
            }
        }
        return '';
    };

    const classifications: AMFIStockClassification[] = [];
    
    for (const row of dataRows) {
        const rowArr = row as unknown[];

        const rankStr = getCell(rowArr, 'Sr. No.', 'Rank', 'Sr.No.', 'S.No.');
        const rank = parseInt(rankStr, 10);
        if (isNaN(rank) || rank <= 0) continue;

        const companyName = getCell(rowArr, 'Company name', 'Company Name', 'Name of the Company');
        if (!companyName) continue;

        let symbol = getCell(rowArr, 'NSE Symbol', 'NSE Code').toUpperCase().trim();
        if (!symbol || symbol === '-' || symbol === 'N/A' || symbol === 'NA') {
            symbol = getCell(rowArr, 'BSE Symbol', 'Symbol', 'Scrip Code').toUpperCase().trim();
        }

        // Skip if still no valid symbol
        if (!symbol || symbol === '-' || symbol === 'N/A' || symbol === 'NA') {
            continue;
        }

        const isin = getCell(rowArr, 'ISIN', 'ISIN Code').toUpperCase();

        const mcapValue = getCell(
            rowArr,
            'Average of All Exchanges (Rs. Cr.)',
            'Average Market Cap (Rs. Cr.)',
            'Average Market Cap',
            'Market Cap'
        );
        const avgMarketCap = parseFloat(String(mcapValue).replace(/,/g, '')) || 0;

        classifications.push({
            rank,
            companyName,
            symbol,
            isin,
            category: getCategoryFromRank(rank),
            avgMarketCap
        });
    }
    
    // Sort by rank ascending
    classifications.sort((a, b) => a.rank - b.rank);

    // Deduplicate by symbol (keep the one with lower rank / higher market cap)
    const seenSymbols = new Set<string>();
    const uniqueClassifications: AMFIStockClassification[] = [];
    for (const c of classifications) {
        if (!seenSymbols.has(c.symbol)) {
            seenSymbols.add(c.symbol);
            uniqueClassifications.push(c);
        }
    }
    
    return uniqueClassifications;
}

async function downloadAMFIData(period: AMFIPeriod): Promise<ArrayBuffer> {
    const url = getAMFIDownloadUrl(period);
    console.log(`Downloading from: ${url}`);
    
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
    }
    
    return response.arrayBuffer();
}

async function syncToDatabase(
    classifications: AMFIStockClassification[],
    period: AMFIPeriod
): Promise<{ created: number; updated: number }> {
    const periodStr = `${period.year}_${period.halfYear}`;
    const validClassifications = classifications.filter((c) => c.symbol);
    
    console.log(`\nSyncing ${validClassifications.length} classifications to database in bulk batches...`);
    
    // Get existing count
    const existingCount = await prisma.aMFIClassification.count({
        where: { period: periodStr },
    });
    
    // Delete existing data for this period
    await prisma.aMFIClassification.deleteMany({
        where: { period: periodStr },
    });
    
    // Bulk insert in batches
    const BATCH_SIZE = 500;
    let insertedCount = 0;
    
    for (let i = 0; i < validClassifications.length; i += BATCH_SIZE) {
        const batch = validClassifications.slice(i, i + BATCH_SIZE);
        await prisma.aMFIClassification.createMany({
            data: batch.map((c) => ({
                period: periodStr,
                rank: c.rank,
                companyName: c.companyName,
                symbol: c.symbol,
                isin: c.isin,
                category: c.category,
                avgMarketCap: c.avgMarketCap,
            })),
        });
        insertedCount += batch.length;
        process.stdout.write(`\rProcessed ${insertedCount} / ${validClassifications.length}`);
    }
    
    console.log(`\n\nSync complete: ${insertedCount} created, ${existingCount} updated/replaced`);
    return { created: insertedCount, updated: existingCount };
}

async function showStatus() {
    const periods = await prisma.aMFIClassification.groupBy({
        by: ['period'],
        _count: { id: true }
    });
    
    console.log('\n=== AMFI Classification Status ===\n');
    
    if (periods.length === 0) {
        console.log('No AMFI data in database.');
    } else {
        console.log('Available periods:');
        for (const p of periods) {
            const categoryBreakdown = await prisma.aMFIClassification.groupBy({
                by: ['category'],
                where: { period: p.period },
                _count: { id: true }
            });
            
            const breakdown = categoryBreakdown
                .map(c => `${c.category}: ${c._count.id}`)
                .join(', ');
            
            console.log(`  ${p.period}: ${p._count.id} stocks (${breakdown})`);
        }
    }
    
    const currentPeriod = getCurrentAMFIPeriod();
    console.log(`\nCurrent applicable period: ${currentPeriod.year}_${currentPeriod.halfYear}`);
}

async function main() {
    const args = process.argv.slice(2);
    
    try {
        // Check for status flag
        if (args.includes('--status')) {
            await showStatus();
            return;
        }
        
        // Check for file flag
        const fileIndex = args.indexOf('--file');
        if (fileIndex !== -1 && args[fileIndex + 1]) {
            const filePath = args[fileIndex + 1];
            console.log(`Reading from local file: ${filePath}`);
            
            const absolutePath = path.isAbsolute(filePath) 
                ? filePath 
                : path.join(process.cwd(), filePath);
            
            const buffer = fs.readFileSync(absolutePath);
            const classifications = await parseAMFIExcel(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
            
            console.log(`\nParsed ${classifications.length} classifications:`);
            console.log(`  Large Cap (1-100): ${classifications.filter(c => c.category === 'Large').length}`);
            console.log(`  Mid Cap (101-250): ${classifications.filter(c => c.category === 'Mid').length}`);
            console.log(`  Small Cap (251-500): ${classifications.filter(c => c.category === 'Small').length}`);
            console.log(`  Micro Cap (501+): ${classifications.filter(c => c.category === 'Micro').length}`);
            
            // Determine period from filename or ask
            let period: AMFIPeriod;
            const match = filePath.match(/(\d{4})/);
            if (match) {
                const year = parseInt(match[1], 10);
                const isH1 = filePath.toLowerCase().includes('jun');
                period = { year, halfYear: isH1 ? 'H1' : 'H2' };
            } else {
                period = getCurrentAMFIPeriod();
            }
            
            console.log(`\nUsing period: ${period.year}_${period.halfYear}`);
            
            await syncToDatabase(classifications, period);
            return;
        }
        
        // Parse year and halfYear from args
        let period: AMFIPeriod;
        
        if (args.length >= 2) {
            const year = parseInt(args[0], 10);
            const halfYear = args[1].toUpperCase() as 'H1' | 'H2';
            
            if (isNaN(year) || (halfYear !== 'H1' && halfYear !== 'H2')) {
                console.error('Invalid arguments. Usage: npx tsx scripts/sync-amfi.ts [year] [H1|H2]');
                process.exit(1);
            }
            
            period = { year, halfYear };
        } else {
            period = getCurrentAMFIPeriod();
        }
        
        console.log(`\n=== AMFI Market Cap Classification Sync ===`);
        console.log(`Period: ${period.year}_${period.halfYear}`);
        
        // Download data
        const buffer = await downloadAMFIData(period);
        console.log(`Downloaded ${(buffer.byteLength / 1024).toFixed(1)} KB`);
        
        // Parse Excel
        const classifications = await parseAMFIExcel(buffer);
        
        console.log(`\nParsed ${classifications.length} classifications:`);
        console.log(`  Large Cap (1-100): ${classifications.filter(c => c.category === 'Large').length}`);
        console.log(`  Mid Cap (101-250): ${classifications.filter(c => c.category === 'Mid').length}`);
        console.log(`  Small Cap (251-500): ${classifications.filter(c => c.category === 'Small').length}`);
        console.log(`  Micro Cap (501+): ${classifications.filter(c => c.category === 'Micro').length}`);
        
        // Show sample data
        console.log('\nSample data (first 5):');
        for (const c of classifications.slice(0, 5)) {
            console.log(`  ${c.rank}. ${c.symbol || 'N/A'} - ${c.companyName} (${c.category}, ₹${c.avgMarketCap.toLocaleString()} Cr)`);
        }
        
        // Sync to database
        await syncToDatabase(classifications, period);
        
    } catch (error) {
        console.error('\nError:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
