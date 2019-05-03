
const fs = require('fs');
const elasticsearch = require('elasticsearch');
const client = new elasticsearch.Client({
  host: 'http://103.220.68.79:9200',
  requestTimeout: 1200000
});

const index_name = 'article_index';
const index_type = '_doc';

function getAllCategoryKey(){
    return client.search({
        index: index_name,
        type: index_type,
        body: {
            aggs : {
                "category_keys" : {
                    terms : { 
                      field : "category.keyword",
                      size: 1000000
                    }
                }
            }
        }
    })
}

function getDataCategory(keyword, from=0, size=10000){
    return client.search({
        index: index_name,
        type: index_type,
        body: {
            query: {
                term : { "category.keyword": keyword} 
            },
            from: from,
            size: size
        }
    })
}

function writeFile(nameFile, data){
    fs.writeFile(nameFile, data, 'utf8', ()=>{
        console.log(nameFile + " is writed");
    });
}

function change_alias(alias) {
    let str = alias;
    str = str.toLowerCase();
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g,"a"); 
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g,"e"); 
    str = str.replace(/ì|í|ị|ỉ|ĩ/g,"i"); 
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g,"o"); 
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g,"u"); 
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g,"y"); 
    str = str.replace(/đ/g,"d");
    str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
    str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
    str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
    str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
    str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
    str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
    str = str.replace(/Đ/g, "D");
    str = str.replace(/!|@|%|\^|\*|\(|\)|\+|\=|\<|\>|\?|\/|,|\.|\:|\;|\'|\"|\&|\#|\[|\]|~|\$|_|`|-|{|}|\||\\/g," ");
    str = str.replace(/ + /g," ");
    str = str.replace(/\s/g,'_');
    str = str.trim(); 
    return str;
}

// var keyword = [
//     "Thời sự",
//     "Thế giới",
//     "Kinh doanh",
//     "Giải trí",
//     "Thể thao",
//     "Pháp luật",
//     "Giáo dục",
//     "Sức khỏe",
//     "Đời sống",
//     "Du lịch",
//     "Khoa học",
//     "Số hóa",
//     "Xe",
//     "Ý kiến",
//     "Cưới",
//     "Xã hội",
//     "Tấm lòng nhân ái",
//     "Bất động sản",
//     "Văn hóa",
//     "Nhịp sống trẻ",
//     "Chuyện lạ",
//     "Khoa học",
//     "Blog",
//     "Bạn đọc",
//     // "Chính trị"
// ]

// const deny = [
//     "Dân trí", "Tags", "Tổ ấm", "Nhịp sống trẻ", "Phim", "Cuộc sống đó đây", "Ảnh", "Tình yêu - Giới tính", "Cười", "Bạn đọc", 
//     "Nhạc", "Tâm sự", "Video", "Các bệnh", "Khỏe đẹp", "Điểm phim", "Làng mốt", "Kinh nghiệm", "Thẩm mỹ", "Dấu chân", "Dinh dưỡng", 
//     "Tiểu phẩm", 
// ]

const allow = [
    "Giải trí", "Thế giới", "Kinh doanh", "Xã hội", "Sức khỏe", "Thể thao", "Pháp luật", "Đời sống", "Du lịch", "Số hóa",
    "Khoa học", "Quốc tế", "Thời sự", "Giới sao", "Văn hóa", "Sức mạnh số", "Doanh nghiệp", "Bóng đá", "Du Lịch", "Trong nước", 
    "Việc làm", "Tư vấn", "Tin tức", "Chính trị", "Tấm lòng nhân ái", "Quân sự", "Truyền hình", "Giao thông", "Tuyển sinh",
    "Tin tuyển sinh", "Thương mại điện tử"
]

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

getAllCategoryKey().then(async resp => {
    let category_keys = resp.aggregations.category_keys.buckets;
    writeFile("./data/countData.json",  JSON.stringify(category_keys));

    let interval = 10 * 1000; // 10 seconds;
    for(let i=0; i< category_keys.length; i++){
        let obj = category_keys[i]
        if(allow.includes(obj.key)){
            try {
                let res = await getDataCategory(obj.key);
                let nameFile = "./data/" + change_alias(obj.key) + "_" + obj.doc_count + ".json";
                let data = [];
                let hits = res.hits.hits;
                for(let j=0; j<hits.length; j++){
                    data.push(hits[j]._source)
                }
                writeFile(nameFile, JSON.stringify(data));
            } catch (error) {
                console.log(error)
            }
            await timeout(interval);
        }
    }
}, function (err) {
    console.log(err.message);
});