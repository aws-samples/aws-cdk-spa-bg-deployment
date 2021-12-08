<!--Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.-->

<!--Permission is hereby granted, free of charge, to any person obtaining a copy of-->
<!--this software and associated documentation files (the "Software"), to deal in-->
<!--the Software without restriction, including without limitation the rights to-->
<!--use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of-->
<!--the Software, and to permit persons to whom the Software is furnished to do so.-->

<!--THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR-->
<!--IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS-->
<!--FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR-->
<!--COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER-->
<!--IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN-->
<!--CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.-->

<template>
  <div class="counter">
    <input type="number" v-model="number1" placeholder="edit me">
    <input type="number" v-model="number2" placeholder="edit me">
    <input id="addition" type="number" v-model="result" placeholder="edit me">
    <button @click="sum">Get Sum</button>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator'

@Component
export default class Addition extends Vue {
  private number1: number = 0 as number
  private number2: number = 0 as number
  private result: number = 0 as number

  private sum () {
    this.result = +this.number1 + +this.number2
  }
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped lang="scss">
</style>
